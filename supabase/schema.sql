-- دفتر العهد: قاعدة البيانات والصلاحيات
-- شغّل هذا الملف كاملاً مرة واحدة من: Supabase > SQL Editor > New query > Run

-- ============ الجداول ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  full_name text not null default '',
  role text not null default 'pending' check (role in ('admin','custodian','pending')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists public.custody_cn_seq;

create table if not exists public.custodies (
  id uuid primary key default gen_random_uuid(),
  cn integer not null default nextval('public.custody_cn_seq'),
  name text not null,
  holder_id uuid references public.profiles(id) on delete restrict,
  holder_label text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  custody_id uuid not null references public.custodies(id) on delete restrict,
  kind text not null check (kind in ('topup','voucher')),
  amount numeric(14,2) not null check (amount > 0),
  entry_date date not null default current_date,
  category text not null default '',
  beneficiary text not null default '',
  description text not null default '',
  seq integer not null default 0,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_by uuid references public.profiles(id),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  cancelled_by uuid,
  cancelled_at timestamptz,
  unique (custody_id, kind, seq)
);

create index if not exists entries_custody_idx on public.entries (custody_id, created_at);
create index if not exists custodies_holder_idx on public.custodies (holder_id);

-- ============ دوال مساعدة ============
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.holds_custody(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.custodies x
    join public.profiles p on p.id = auth.uid()
    where x.id = c and x.holder_id = auth.uid() and p.role = 'custodian' and p.active
  );
$$;

create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

-- ============ إنشاء الملف الشخصي عند تسجيل مستخدم جديد ============
-- أول حساب يُسجَّل يصبح مديراً، وبقية الحسابات تبدأ "بانتظار التفعيل" حتى يحدد المدير دورها.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := 'pending';
  uname text := split_part(new.email, '@', 1);
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    r := 'admin';
  end if;
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), uname),
    r
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ قواعد الحركات: الترقيم والرصيد ============
create or replace function public.entries_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  bal numeric;
  nm text;
begin
  -- قفل العهدة لمنع تعارض الترقيم أو الصرف المتزامن
  perform 1 from public.custodies where id = new.custody_id for update;

  new.created_by := auth.uid();
  select full_name into nm from public.profiles where id = auth.uid();
  new.created_by_name := coalesce(nm, '');
  new.status := 'active';
  new.cancelled_by := null;
  new.cancelled_at := null;

  select coalesce(max(seq), 0) + 1 into new.seq
  from public.entries
  where custody_id = new.custody_id and kind = new.kind;

  if new.kind = 'voucher' then
    select coalesce(sum(case when kind = 'topup' then amount else -amount end), 0)
      into bal
    from public.entries
    where custody_id = new.custody_id and status = 'active';
    if new.amount > bal then
      raise exception 'insufficient_balance';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists entries_before_insert on public.entries;
create trigger entries_before_insert
  before insert on public.entries
  for each row execute function public.entries_before_insert();

-- إلغاء حركة: المدير يلغي أي حركة، وأمين العهدة يلغي سندات صرفه فقط
create or replace function public.cancel_entry(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entries;
  bal numeric;
begin
  select * into e from public.entries where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if e.status = 'cancelled' then
    return;
  end if;
  if not (
    public.is_admin()
    or (e.kind = 'voucher' and e.created_by = auth.uid() and public.holds_custody(e.custody_id))
  ) then
    raise exception 'forbidden';
  end if;
  if e.kind = 'topup' then
    select coalesce(sum(case when kind = 'topup' then amount else -amount end), 0)
      into bal
    from public.entries
    where custody_id = e.custody_id and status = 'active' and id <> e.id;
    if bal < 0 then
      raise exception 'would_overdraw';
    end if;
  end if;
  update public.entries
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_id;
end;
$$;

-- ============ الصلاحيات (RLS) ============
alter table public.profiles  enable row level security;
alter table public.custodies enable row level security;
alter table public.entries   enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists custodies_select on public.custodies;
create policy custodies_select on public.custodies
  for select to authenticated
  using (public.is_admin() or public.holds_custody(id));

drop policy if exists custodies_insert on public.custodies;
create policy custodies_insert on public.custodies
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists custodies_update on public.custodies;
create policy custodies_update on public.custodies
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists custodies_delete on public.custodies;
create policy custodies_delete on public.custodies
  for delete to authenticated
  using (public.is_admin());

drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select to authenticated
  using (public.is_admin() or public.holds_custody(custody_id));

-- المدير يضيف أي حركة. أمين العهدة يسجل سندات صرف على عهدته فقط (لا يستطيع إضافة رصيد).
drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert to authenticated
  with check (
    public.is_admin()
    or (kind = 'voucher' and public.holds_custody(custody_id))
  );

drop policy if exists entries_update_admin on public.entries;
create policy entries_update_admin on public.entries
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists entries_delete_admin on public.entries;
create policy entries_delete_admin on public.entries
  for delete to authenticated
  using (public.is_admin());

-- ============ صلاحيات التنفيذ ============
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.custodies, public.entries to authenticated;
grant usage, select on sequence public.custody_cn_seq to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.holds_custody(uuid) to authenticated;
grant execute on function public.cancel_entry(uuid) to authenticated;
-- يحتاجها شاشة الدخول لمعرفة هل أُنشئ المدير الأول
grant execute on function public.admin_exists() to anon, authenticated;
