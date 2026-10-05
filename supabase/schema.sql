-- =====================================================================================================
-- Jeevunjee Scholarship portal — database schema for Supabase.
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste this whole file → Run.
-- It is safe to run again; it only creates what is missing.
--
-- Who can see what (enforced by the database itself, not the website):
--   • Trustees (admins) see and edit everything.
--   • A student sees only their own profile, course, payment schedule and documents, and can upload
--     invoices, results and receipts to their own file. They never see notes or other students.
--   • The public can only submit an application (and upload its files). They can read nothing back.
-- =====================================================================================================

-- ---------- trusts ------------------------------------------------------------------------------------
create table if not exists public.trusts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
insert into public.trusts (name) values ('Rukan Trust'), ('Y A J Noorbhai Trust') on conflict (name) do nothing;

-- ---------- trustee email allow-list (filled in during setup; never readable from the website) ---------
create table if not exists public.admin_emails (
  email text primary key,
  claimed boolean not null default false
);

-- ---------- applications from the public website -----------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'new' check (status in ('new', 'reviewing', 'interview', 'accepted', 'declined')),
  full_name text not null,
  email text,
  phone text,
  answers jsonb not null,
  files jsonb not null default '[]'::jsonb,   -- [{ field, label, name, path, mime, size }] in the "applications" bucket
  review_notes text,
  created_at timestamptz not null default now()
);

-- ---------- students ----------------------------------------------------------------------------------
create sequence if not exists public.student_code_seq start 1;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  -- Short unique code shown everywhere, so two students with the same name are never mixed up.
  code text not null unique default ('S-' || lpad(nextval('public.student_code_seq')::text, 3, '0')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'withdrawn')),
  full_name text not null,
  preferred_name text,
  date_of_birth date,
  nic text,
  phone text,
  whatsapp text,
  email text,
  address text,
  city text,
  school text,
  guardian_details text,
  family_situation text,
  ambition text,
  photo_bucket text,
  photo_path text,
  application_id uuid references public.applications (id) on delete set null,
  access_code text unique,
  access_code_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications add column if not exists student_id uuid references public.students (id) on delete set null;

-- ---------- logins ------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'student')),
  student_id uuid references public.students (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  check ((role = 'student') = (student_id is not null))
);

-- ---------- courses, instalments, payments ------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  trust_id uuid references public.trusts (id),
  title text not null,
  institution text,
  awarding_body text,
  start_date date,
  duration_years numeric(3, 1),
  payment_plan text,
  total_fee_lkr numeric(14, 2) not null default 0,
  total_fee_foreign numeric(14, 2) not null default 0,
  foreign_currency text check (foreign_currency in ('GBP', 'USD', 'EUR', 'AUD')),
  status text not null default 'ongoing' check (status in ('ongoing', 'completed', 'paused', 'withdrawn')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.instalments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,   -- copied from the course
  label text not null,
  due_date date,
  amount_lkr numeric(14, 2) not null default 0,
  amount_foreign numeric(14, 2) not null default 0,
  foreign_currency text check (foreign_currency in ('GBP', 'USD', 'EUR', 'AUD')),
  funded_by text not null default 'trust' check (funded_by in ('trust', 'self')),
  status text not null default 'due' check (status in ('due', 'paid', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  instalment_id uuid references public.instalments (id) on delete set null,
  trust_id uuid references public.trusts (id),
  paid_on date not null,
  amount_lkr numeric(14, 2) not null default 0,
  amount_foreign numeric(14, 2) not null default 0,
  foreign_currency text check (foreign_currency in ('GBP', 'USD', 'EUR', 'AUD')),
  -- Rupees per 1 unit of foreign currency on the day it was paid, so the real cost to the trust is fixed.
  fx_rate numeric(12, 4),
  total_lkr numeric(16, 2) generated always as (amount_lkr + coalesce(amount_foreign * fx_rate, 0)) stored,
  method text,
  paid_to text,
  reference text,
  notes text,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount_foreign = 0 or foreign_currency is not null)
);

-- ---------- documents and notes -----------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  bucket text not null default 'files' check (bucket in ('files', 'applications')),
  path text not null,
  category text not null check (category in
    ('photo', 'identity', 'certificate', 'results', 'invoice', 'receipt', 'fee_schedule', 'application', 'income', 'other')),
  title text not null,
  mime text,
  size_bytes bigint,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  uploaded_by_role text not null default 'admin' check (uploaded_by_role in ('admin', 'student', 'applicant')),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  body text not null,
  author uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text,
  created_at timestamptz not null default now()
);

create index if not exists courses_student_idx on public.courses (student_id);
create index if not exists instalments_student_idx on public.instalments (student_id);
create index if not exists instalments_due_idx on public.instalments (due_date) where status = 'due';
create index if not exists payments_student_idx on public.payments (student_id);
create index if not exists documents_student_idx on public.documents (student_id);
create index if not exists notes_student_idx on public.notes (student_id);

-- =====================================================================================================
-- Helpers
-- =====================================================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid() and role = 'student' limit 1;
$$;

-- Random code from a strong source (gen_random_uuid). No 0/O/1/I so it can be read out over the phone.
create or replace function public.random_code(n int) returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  bytes bytea;
  i int;
begin
  while length(out) < n loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    -- bytes 6 and 8 carry the uuid version/variant bits; skip them
    for i in 0..15 loop
      if i not in (6, 8) and length(out) < n then
        out := out || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
      end if;
    end loop;
  end loop;
  return out;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists students_touch on public.students;
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();

-- Instalments always belong to the same student as their course.
create or replace function public.instalment_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select student_id into new.student_id from public.courses where id = new.course_id;
  return new;
end $$;

drop trigger if exists instalments_student on public.instalments;
create trigger instalments_student before insert or update of course_id on public.instalments
  for each row execute function public.instalment_student();

-- =====================================================================================================
-- Sign-up: only allow-listed trustees, or students holding a valid access code, may create an account.
-- Anyone else is refused, so the sign-up form cannot be used by strangers.
-- =====================================================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(replace(trim(coalesce(new.raw_user_meta_data ->> 'access_code', '')), '-', ''));
  v_student public.students%rowtype;
begin
  if exists (select 1 from public.admin_emails where lower(email) = lower(new.email) and not claimed) then
    update public.admin_emails set claimed = true where lower(email) = lower(new.email);
    insert into public.profiles (id, role, email, full_name)
      values (new.id, 'admin', new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));
    return new;
  end if;

  if v_code <> '' then
    select * into v_student from public.students
      where access_code = v_code and access_code_expires > now()
      for update;
    if found then
      insert into public.profiles (id, role, student_id, email, full_name)
        values (new.id, 'student', v_student.id, new.email, v_student.full_name);
      update public.students set access_code = null, access_code_expires = null where id = v_student.id;
      return new;
    end if;
  end if;

  raise exception 'JVJ_SIGNUP_NOT_ALLOWED';
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trustee creates a one-time code (valid 14 days) that lets a student create their login.
create or replace function public.issue_access_code(p_student uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  loop
    v := public.random_code(8);
    exit when not exists (select 1 from public.students where access_code = v);
  end loop;
  update public.students set access_code = v, access_code_expires = now() + interval '14 days' where id = p_student;
  if not found then raise exception 'student not found'; end if;
  return v;
end $$;

-- =====================================================================================================
-- Public application submission. The website calls this; the public can never read applications back.
-- =====================================================================================================

create or replace function public.submit_application(p_answers jsonb, p_files jsonb default '[]'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(trim(coalesce(p_answers ->> 'fullName', '')), 200);
  v_ref text;
  f jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 200000 then raise exception 'invalid answers'; end if;
  if v_name = '' then raise exception 'missing name'; end if;
  if coalesce(p_answers ->> 'email', '') = '' and coalesce(p_answers ->> 'phone', '') = '' then
    raise exception 'missing contact';
  end if;
  if coalesce(p_answers ->> 'signatureName', '') = '' then raise exception 'missing signature'; end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 30 then raise exception 'invalid files'; end if;
  for f in select * from jsonb_array_elements(p_files) loop
    if coalesce(f ->> 'path', '') !~ '^incoming/[0-9a-f-]{36}/[^/]+$' then raise exception 'invalid file path'; end if;
  end loop;

  loop
    v_ref := 'JVJ-' || to_char(now(), 'YYYY') || '-' || public.random_code(5);
    exit when not exists (select 1 from public.applications where reference = v_ref);
  end loop;

  insert into public.applications (reference, full_name, email, phone, answers, files)
  values (v_ref, v_name, nullif(left(p_answers ->> 'email', 200), ''), nullif(left(p_answers ->> 'phone', 50), ''),
          p_answers, p_files);
  return v_ref;
end $$;

-- Trustee turns an application into a student file: profile, course, payment plan and documents.
create or replace function public.enrol_application(p_application uuid, p_trust uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a public.applications%rowtype;
  ans jsonb;
  v_student uuid;
  v_course uuid;
  v_currency text;
  r jsonb;
  f jsonb;
  photo jsonb;
  v_category text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'application not found'; end if;
  if a.student_id is not null then return a.student_id; end if;
  ans := a.answers;
  v_currency := nullif(ans ->> 'foreignCurrency', '');
  select value into photo from jsonb_array_elements(a.files) where value ->> 'field' = 'photo' limit 1;

  insert into public.students (full_name, date_of_birth, phone, whatsapp, email, city, school,
                               family_situation, ambition, photo_bucket, photo_path, application_id)
  values (a.full_name,
          nullif(ans ->> 'dateOfBirth', '')::date,
          a.phone, a.phone, a.email,
          nullif(ans ->> 'city', ''),
          nullif(ans ->> 'school', ''),
          nullif(ans ->> 'familySituation', ''),
          nullif(concat_ws(E'\n\n', nullif(ans ->> 'ambition', ''), nullif(ans ->> 'goals', '')), ''),
          case when photo is not null then 'applications' end,
          photo ->> 'path',
          a.id)
  returning id into v_student;

  insert into public.courses (student_id, trust_id, title, institution, awarding_body, start_date, duration_years,
                              payment_plan, total_fee_lkr, total_fee_foreign, foreign_currency)
  values (v_student, p_trust,
          coalesce(nullif(ans ->> 'courseTitle', ''), 'Course'),
          nullif(ans ->> 'institution', ''),
          nullif(ans ->> 'awardingBody', ''),
          case when coalesce(ans ->> 'startMonth', '') ~ '^\d{4}-\d{2}$' then (ans ->> 'startMonth' || '-01')::date end,
          nullif(ans ->> 'durationYears', '')::numeric,
          nullif(ans ->> 'paymentFrequency', ''),
          coalesce(nullif(ans ->> 'totalFeeLkr', '')::numeric, 0),
          coalesce(nullif(ans ->> 'totalFeeForeign', '')::numeric, 0),
          v_currency)
  returning id into v_course;

  for r in select * from jsonb_array_elements(coalesce(ans -> 'plan', '[]'::jsonb)) loop
    insert into public.instalments (course_id, student_id, label, due_date, amount_lkr, amount_foreign, foreign_currency,
                                    funded_by)
    values (v_course, v_student,
            coalesce(nullif(r ->> 'label', ''), 'Instalment'),
            case when coalesce(r ->> 'when', '') ~ '^\d{4}-\d{2}$' then (r ->> 'when' || '-01')::date end,
            coalesce(nullif(r ->> 'amountLkr', '')::numeric, 0),
            coalesce(nullif(r ->> 'amountForeign', '')::numeric, 0),
            case when coalesce(nullif(r ->> 'amountForeign', '')::numeric, 0) > 0 then coalesce(v_currency, 'GBP') end,
            case when r ->> 'payer' = 'self' then 'self' else 'trust' end);
  end loop;

  for f in select * from jsonb_array_elements(a.files) loop
    v_category := case
      when f ->> 'field' = 'photo' then 'photo'
      when f ->> 'field' = 'idFile' then 'identity'
      when f ->> 'field' like 'edu:%' then 'certificate'
      when f ->> 'field' = 'feeSchedule' then 'fee_schedule'
      when f ->> 'field' = 'incomeProof' then 'income'
      else 'application' end;
    insert into public.documents (student_id, bucket, path, category, title, mime, size_bytes, uploaded_by, uploaded_by_role)
    values (v_student, 'applications', f ->> 'path', v_category,
            coalesce(nullif(f ->> 'label', ''), f ->> 'name', 'Document'),
            f ->> 'mime', nullif(f ->> 'size', '')::bigint, null, 'applicant');
  end loop;

  update public.applications set student_id = v_student, status = 'accepted' where id = a.id;
  return v_student;
end $$;

-- =====================================================================================================
-- Row-level security: the rules above, enforced on every table.
-- =====================================================================================================

alter table public.trusts enable row level security;
alter table public.admin_emails enable row level security;
alter table public.applications enable row level security;
alter table public.students enable row level security;
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.instalments enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;
alter table public.notes enable row level security;

do $$
declare t text;
begin
  -- clear our own policies so this file can be re-run after edits
  for t in select unnest(array['trusts','applications','students','profiles','courses','instalments','payments','documents','notes']) loop
    execute format('drop policy if exists "admin all" on public.%I', t);
    execute format('drop policy if exists "student reads own" on public.%I', t);
  end loop;
end $$;
drop policy if exists "signed-in read" on public.trusts;
drop policy if exists "read own profile" on public.profiles;
drop policy if exists "student uploads own" on public.documents;

-- trustees: everything
create policy "admin all" on public.trusts       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.applications for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.students     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.profiles     for select to authenticated using (public.is_admin());
create policy "admin all" on public.courses      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.instalments  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.payments     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.documents    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.notes        for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- everyone signed in: trust names and their own login record
create policy "signed-in read" on public.trusts for select to authenticated using (true);
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- students: read-only access to their own file
create policy "student reads own" on public.students    for select to authenticated using (id = public.my_student_id());
create policy "student reads own" on public.courses     for select to authenticated using (student_id = public.my_student_id());
create policy "student reads own" on public.instalments for select to authenticated using (student_id = public.my_student_id());
create policy "student reads own" on public.payments    for select to authenticated using (student_id = public.my_student_id());
create policy "student reads own" on public.documents   for select to authenticated using (student_id = public.my_student_id());

-- students: may add invoices, results, receipts and certificates to their own file
create policy "student uploads own" on public.documents for insert to authenticated with check (
  student_id = public.my_student_id()
  and uploaded_by = auth.uid()
  and uploaded_by_role = 'student'
  and bucket = 'files'
  and path like 'students/' || public.my_student_id()::text || '/%'
  and category in ('invoice', 'results', 'receipt', 'certificate', 'other')
);

grant execute on function public.submit_application(jsonb, jsonb) to anon, authenticated;
grant execute on function public.enrol_application(uuid, uuid) to authenticated;
grant execute on function public.issue_access_code(uuid) to authenticated;
revoke execute on function public.random_code(int) from anon, authenticated, public;

-- =====================================================================================================
-- File storage: two private buckets.
--   applications/incoming/<random>/<file>   uploaded by applicants; only trustees can open them.
--   files/students/<student id>/<file>      the student's file; trustees and that student can open them.
-- =====================================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 10485760, array['image/*', 'application/pdf']),
       ('files', 'files', false, 15728640, array['image/*', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "jvj applicants upload" on storage.objects;
drop policy if exists "jvj admins read" on storage.objects;
drop policy if exists "jvj admins manage files" on storage.objects;
drop policy if exists "jvj students read own" on storage.objects;
drop policy if exists "jvj students upload own" on storage.objects;
drop policy if exists "jvj students read own application files" on storage.objects;

create policy "jvj applicants upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'applications' and (storage.foldername(name))[1] = 'incoming');

create policy "jvj admins read" on storage.objects for select to authenticated
  using (bucket_id in ('applications', 'files') and public.is_admin());

create policy "jvj admins manage files" on storage.objects for all to authenticated
  using (bucket_id = 'files' and public.is_admin())
  with check (bucket_id = 'files' and public.is_admin());

create policy "jvj students read own" on storage.objects for select to authenticated
  using (bucket_id = 'files'
         and (storage.foldername(name))[1] = 'students'
         and (storage.foldername(name))[2] = public.my_student_id()::text);

create policy "jvj students upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'files'
              and (storage.foldername(name))[1] = 'students'
              and (storage.foldername(name))[2] = public.my_student_id()::text);

-- A student can also open the files from their original application once it is part of their file.
create policy "jvj students read own application files" on storage.objects for select to authenticated
  using (bucket_id = 'applications'
         and exists (select 1 from public.documents d
                     where d.bucket = 'applications' and d.path = storage.objects.name
                       and d.student_id = public.my_student_id()));
