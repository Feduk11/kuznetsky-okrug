-- Run once in a NEW Supabase project. No service key is needed by the website.
begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
create policy "Read own admin membership" on public.admin_users for select to authenticated using(user_id = (select auth.uid()));
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(btrim(display_name)) between 1 and 100),
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Participants read author names" on public.profiles for select to authenticated using(true);
create policy "Update own name" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;

create function public.create_actor_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(btrim(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')),100),''),'Участник'));
 return new;
end;
$$;
revoke all on function public.create_actor_profile() from public;
create trigger actor_profile_after_signup after insert on auth.users for each row execute function public.create_actor_profile();

create table public.characters (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 200),
 description text not null check(length(btrim(description)) between 1 and 5000),
 personality text not null check(length(btrim(personality)) between 1 and 5000),
 traits text not null default '' check(length(traits)<=5000),
 relationships text not null default '' check(length(relationships)<=5000),
 history text not null default '' check(length(history)<=10000),
 casting_status text not null default 'open' check(casting_status in ('open','cast','uncertain')),
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create table public.lore_chapters (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 200),
 content text not null check(length(btrim(content)) between 1 and 30000),
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.characters enable row level security;
alter table public.lore_chapters enable row level security;
create policy "Public character reading" on public.characters for select to anon, authenticated using(true);
create policy "Organizer manages characters" on public.characters for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy "Public lore reading" on public.lore_chapters for select to anon, authenticated using(true);
create policy "Organizer manages lore" on public.lore_chapters for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
revoke all on public.characters, public.lore_chapters from anon,authenticated;
grant select on public.characters, public.lore_chapters to anon;
grant select,insert,update,delete on public.characters, public.lore_chapters to authenticated;

create table public.applications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 city text not null check(length(btrim(city)) between 1 and 100),
 participation text not null check(participation in ('returning','new')),
 role_name text not null default '' check(length(role_name)<=200),
 experience text not null check(length(btrim(experience)) between 1 and 5000),
 availability text not null check(length(btrim(availability)) between 1 and 2000),
 contact text not null check(length(btrim(contact)) between 1 and 200),
 portfolio text not null default '' check(length(portfolio)<=500),
 status text not null default 'submitted' check(status in ('submitted','accepted','declined')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.applications enable row level security;
create policy "Read own application or organizer" on public.applications for select to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
create policy "Submit own application" on public.applications for insert to authenticated with check(user_id=(select auth.uid()) and status='submitted');
create policy "Update own application" on public.applications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.applications from anon,authenticated;
grant select,insert on public.applications to authenticated;
-- status and ownership cannot be changed from the browser by an applicant.
grant update(city,participation,role_name,experience,availability,contact,portfolio) on public.applications to authenticated;

create function public.timestamp_application() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now();return new;end;
$$;
revoke all on function public.timestamp_application() from public;
create trigger timestamp_application before update on public.applications for each row execute function public.timestamp_application();

create table public.cast_members (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 display_name text not null,
 role_name text not null default '',
 participation text not null check(participation in ('returning','new')),
 created_at timestamptz not null default now()
);
alter table public.cast_members enable row level security;
create policy "Public cast reading" on public.cast_members for select to anon,authenticated using(true);
revoke all on public.cast_members from anon,authenticated;
grant select(id,display_name,role_name,participation,created_at) on public.cast_members to anon,authenticated;
-- user_id is kept private; use a public-column projection in the frontend.

create function public.review_application(application_id uuid,new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare a public.applications; actor_name text;
begin
 if not public.is_admin() then raise exception 'Forbidden' using errcode='42501';end if;
 if new_status not in ('accepted','declined','submitted') then raise exception 'Invalid status';end if;
 select * into a from public.applications where id=application_id for update;
 if not found then raise exception 'Application not found';end if;
 update public.applications set status=new_status where id=application_id;
 if new_status='accepted' then
   select display_name into actor_name from public.profiles where id=a.user_id;
   insert into public.cast_members(user_id,display_name,role_name,participation)
   values(a.user_id,actor_name,a.role_name,a.participation)
   on conflict(user_id) do update set display_name=excluded.display_name,role_name=excluded.role_name,participation=excluded.participation;
 else delete from public.cast_members where user_id=a.user_id;
 end if;
end;
$$;
revoke all on function public.review_application(uuid,text) from public;
grant execute on function public.review_application(uuid,text) to authenticated;

create table public.ideas (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160),
 content text not null check(length(btrim(content)) between 1 and 10000),
 created_at timestamptz not null default now()
);
alter table public.ideas enable row level security;
create policy "Participants read ideas" on public.ideas for select to authenticated using(true);
create policy "Publish own idea" on public.ideas for insert to authenticated with check(user_id=(select auth.uid()));
create policy "Delete own idea or moderate" on public.ideas for delete to authenticated using(user_id=(select auth.uid()) or (select public.is_admin()));
revoke all on public.ideas from anon,authenticated;
grant select,insert,delete on public.ideas to authenticated;
create index ideas_by_created_at on public.ideas(created_at desc);
create index applications_by_created_at on public.applications(created_at desc);
commit;
