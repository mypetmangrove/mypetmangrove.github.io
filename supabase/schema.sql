-- ============================================================
-- My Pet Mangrove: teacher portal database
-- Paste this whole file into Supabase > SQL Editor and click Run.
-- It is safe to run more than once.
-- ============================================================

-- ---------- Teacher profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  full_name   text not null default '' check (char_length(full_name) <= 120),
  school      text not null default '' check (char_length(school) <= 160),
  county      text not null default '' check (char_length(county) <= 80),
  role        text not null default 'teacher' check (role in ('teacher', 'admin')),
  created_at  timestamptz not null default now()
);

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, school, county)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'school', ''), 160),
    left(coalesce(new.raw_user_meta_data ->> 'county', ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the signed-in person is a My Pet Mangrove admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- Classes ----------
create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  grade_level  text not null default '' check (char_length(grade_level) <= 20),
  school_year  text not null default '' check (char_length(school_year) <= 20),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
-- (For databases created from an earlier version of this file.)
alter table public.profiles add column if not exists email text not null default '';

create index if not exists classes_teacher_idx on public.classes (teacher_id);

-- ---------- Students (first name + last initial only) ----------
create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes (id) on delete cascade,
  teacher_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  created_at    timestamptz not null default now()
);
create index if not exists students_class_idx on public.students (class_id);

-- ---------- Seedlings ----------
create table if not exists public.seedlings (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,
  teacher_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  student_id     uuid references public.students (id) on delete set null,
  nickname       text not null check (char_length(nickname) between 1 and 60),
  species        text not null default 'red' check (species in ('red', 'black', 'white', 'unknown')),
  started_on     date not null default current_date,
  status         text not null default 'growing' check (status in ('growing', 'planted', 'lost')),
  planted_on     date,
  planting_site  text not null default '' check (char_length(planting_site) <= 160),
  notes          text not null default '' check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now()
);
create index if not exists seedlings_class_idx on public.seedlings (class_id);

-- ---------- Growth check-ins ----------
create table if not exists public.growth_logs (
  id           uuid primary key default gen_random_uuid(),
  seedling_id  uuid not null references public.seedlings (id) on delete cascade,
  teacher_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  logged_on    date not null default current_date,
  height_cm    numeric(5,1) check (height_cm is null or (height_cm >= 0 and height_cm < 1000)),
  leaf_count   integer check (leaf_count is null or (leaf_count >= 0 and leaf_count < 1000)),
  note         text not null default '' check (char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index if not exists growth_logs_seedling_idx on public.growth_logs (seedling_id);

-- ---------- Photos ----------
create table if not exists public.photos (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes (id) on delete cascade,
  teacher_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  seedling_id     uuid references public.seedlings (id) on delete set null,
  storage_path    text not null check (char_length(storage_path) <= 300),
  caption         text not null default '' check (char_length(caption) <= 200),
  share_ok        boolean not null default false,
  approved        boolean not null default false,
  public_path     text,
  created_at      timestamptz not null default now()
);
create index if not exists photos_class_idx on public.photos (class_id);

-- ---------- Website form messages ----------
create table if not exists public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'general'
                check (kind in ('general', 'school', 'volunteer', 'partner', 'support', 'visit', 'lesson')),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 200 and position('@' in email) > 1),
  organization  text not null default '' check (char_length(organization) <= 160),
  message       text not null default '' check (char_length(message) <= 4000),
  details       jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 4000),
  handled       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------- Newsletter sign-ups ----------
create table if not exists public.subscribers (
  email       text primary key check (char_length(email) between 3 and 200 and position('@' in email) > 1),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Row-level security: teachers only ever see their own classes.
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.classes     enable row level security;
alter table public.students    enable row level security;
alter table public.seedlings   enable row level security;
alter table public.growth_logs enable row level security;
alter table public.photos      enable row level security;
alter table public.inquiries   enable row level security;
alter table public.subscribers enable row level security;

-- Profiles: read your own (admins read all); teachers can't change their role.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, school, county) on public.profiles to authenticated;

-- Classes
drop policy if exists "classes read" on public.classes;
create policy "classes read" on public.classes
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists "classes insert" on public.classes;
create policy "classes insert" on public.classes
  for insert to authenticated with check (teacher_id = auth.uid());
drop policy if exists "classes update" on public.classes;
create policy "classes update" on public.classes
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists "classes delete" on public.classes;
create policy "classes delete" on public.classes
  for delete to authenticated using (teacher_id = auth.uid());

-- Students
drop policy if exists "students read" on public.students;
create policy "students read" on public.students
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists "students insert" on public.students;
create policy "students insert" on public.students
  for insert to authenticated with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );
drop policy if exists "students update" on public.students;
create policy "students update" on public.students
  for update to authenticated using (teacher_id = auth.uid()) with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );
drop policy if exists "students delete" on public.students;
create policy "students delete" on public.students
  for delete to authenticated using (teacher_id = auth.uid());

-- Seedlings
drop policy if exists "seedlings read" on public.seedlings;
create policy "seedlings read" on public.seedlings
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists "seedlings insert" on public.seedlings;
create policy "seedlings insert" on public.seedlings
  for insert to authenticated with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    and (student_id is null or exists (
      select 1 from public.students s where s.id = student_id and s.class_id = seedlings.class_id))
  );
drop policy if exists "seedlings update" on public.seedlings;
create policy "seedlings update" on public.seedlings
  for update to authenticated using (teacher_id = auth.uid()) with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    and (student_id is null or exists (
      select 1 from public.students s where s.id = student_id and s.class_id = seedlings.class_id))
  );
drop policy if exists "seedlings delete" on public.seedlings;
create policy "seedlings delete" on public.seedlings
  for delete to authenticated using (teacher_id = auth.uid());

-- Growth check-ins
drop policy if exists "growth read" on public.growth_logs;
create policy "growth read" on public.growth_logs
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists "growth insert" on public.growth_logs;
create policy "growth insert" on public.growth_logs
  for insert to authenticated with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.seedlings s where s.id = seedling_id and s.teacher_id = auth.uid())
  );
drop policy if exists "growth delete" on public.growth_logs;
create policy "growth delete" on public.growth_logs
  for delete to authenticated using (teacher_id = auth.uid());

-- Photos
drop policy if exists "photos read" on public.photos;
create policy "photos read" on public.photos
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists "photos insert" on public.photos;
create policy "photos insert" on public.photos
  for insert to authenticated with check (
    teacher_id = auth.uid()
    and approved = false
    and public_path is null
    and storage_path like auth.uid()::text || '/%'
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    and (seedling_id is null or exists (
      select 1 from public.seedlings s where s.id = seedling_id and s.class_id = photos.class_id))
  );
drop policy if exists "photos update" on public.photos;
create policy "photos update" on public.photos
  for update to authenticated using (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());
drop policy if exists "photos delete" on public.photos;
create policy "photos delete" on public.photos
  for delete to authenticated using (teacher_id = auth.uid() or public.is_admin());

-- Teachers may change caption, seedling and share permission; only admins approve.
create or replace function public.guard_photo_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() then
    new.approved := old.approved;
    new.public_path := old.public_path;
    new.storage_path := old.storage_path;
    new.teacher_id := old.teacher_id;
    new.class_id := old.class_id;
  end if;
  -- Withdrawing permission un-features the photo.
  if new.share_ok = false then
    new.approved := false;
  end if;
  return new;
end;
$$;
drop trigger if exists photos_guard on public.photos;
create trigger photos_guard before update on public.photos
  for each row execute function public.guard_photo_approval();

-- Website forms: anyone can send; only admins can read.
drop policy if exists "inquiries send" on public.inquiries;
create policy "inquiries send" on public.inquiries
  for insert to anon, authenticated with check (handled = false);
drop policy if exists "inquiries admin read" on public.inquiries;
create policy "inquiries admin read" on public.inquiries
  for select to authenticated using (public.is_admin());
drop policy if exists "inquiries admin update" on public.inquiries;
create policy "inquiries admin update" on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "inquiries admin delete" on public.inquiries;
create policy "inquiries admin delete" on public.inquiries
  for delete to authenticated using (public.is_admin());

drop policy if exists "subscribers join" on public.subscribers;
create policy "subscribers join" on public.subscribers
  for insert to anon, authenticated with check (true);
drop policy if exists "subscribers admin read" on public.subscribers;
create policy "subscribers admin read" on public.subscribers
  for select to authenticated using (public.is_admin());
drop policy if exists "subscribers admin delete" on public.subscribers;
create policy "subscribers admin delete" on public.subscribers
  for delete to authenticated using (public.is_admin());

grant insert on public.inquiries, public.subscribers to anon;

-- ============================================================
-- Public numbers and photos for the website (no personal data).
-- ============================================================
create or replace function public.impact_totals()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'schools',   (select count(distinct lower(trim(p.school))) from public.profiles p
                  where p.school <> '' and exists (select 1 from public.classes c where c.teacher_id = p.id)),
    'classes',   (select count(*) from public.classes),
    'students',  (select count(*) from public.students),
    'seedlings', (select count(*) from public.seedlings),
    'growing',   (select count(*) from public.seedlings where status = 'growing'),
    'planted',   (select count(*) from public.seedlings where status = 'planted')
  );
$$;

create or replace function public.public_gallery(max_items integer default 12)
returns table (id uuid, caption text, public_path text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, ph.caption, ph.public_path, ph.created_at
  from public.photos ph
  where ph.approved and ph.share_ok and ph.public_path is not null
  order by ph.created_at desc
  limit least(greatest(max_items, 1), 48);
$$;

grant execute on function public.impact_totals() to anon, authenticated;
grant execute on function public.public_gallery(integer) to anon, authenticated;

-- ============================================================
-- Photo storage
--   class-photos: private, each teacher writes only to their own folder
--   gallery:      public, only admins add photos they have approved
-- ============================================================
insert into storage.buckets (id, name, public)
values ('class-photos', 'class-photos', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

drop policy if exists "class photos read" on storage.objects;
create policy "class photos read" on storage.objects
  for select to authenticated using (
    bucket_id = 'class-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
drop policy if exists "class photos upload" on storage.objects;
create policy "class photos upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'class-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "class photos delete" on storage.objects;
create policy "class photos delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'class-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "gallery admin read" on storage.objects;
create policy "gallery admin read" on storage.objects
  for select to authenticated using (bucket_id = 'gallery' and public.is_admin());
drop policy if exists "gallery admin upload" on storage.objects;
create policy "gallery admin upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery' and public.is_admin());
drop policy if exists "gallery admin update" on storage.objects;
create policy "gallery admin update" on storage.objects
  for update to authenticated using (bucket_id = 'gallery' and public.is_admin());
drop policy if exists "gallery admin delete" on storage.objects;
create policy "gallery admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery' and public.is_admin());

-- ============================================================
-- After you create your own account on the website's Teacher Login page,
-- run this once (with your email) to make yourself an admin:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'mypetmangrove@gmail.com');
-- ============================================================
