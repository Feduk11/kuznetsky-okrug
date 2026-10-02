-- Run on the existing project before uploading the new frontend.
-- Safe to run again. Keeps accounts, applications, ideas and admin rights.
begin;
alter table public.profiles add column if not exists avatar_url text;
alter table public.cast_members add column if not exists avatar_url text;
grant select(avatar_url) on public.cast_members to anon,authenticated;

create or replace function public.provider_avatar(metadata jsonb) returns text
language sql immutable set search_path = '' as $$
 select case when length(url)<=2048 and url ~ '^https://[^[:space:]]+$' then url else null end
 from (select coalesce(nullif(metadata->>'avatar_url',''),nullif(metadata->>'picture','')) as url) source;
$$;
revoke all on function public.provider_avatar(jsonb) from public;

create or replace function public.sync_provider_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare photo text;
begin
 photo=public.provider_avatar(new.raw_user_meta_data);
 update public.profiles set avatar_url=photo where id=new.id;
 update public.cast_members set avatar_url=photo where user_id=new.id;
 return new;
end;
$$;
revoke all on function public.sync_provider_avatar() from public;
drop trigger if exists profile_avatar_after_auth on auth.users;
create trigger profile_avatar_after_auth after insert or update of raw_user_meta_data on auth.users
 for each row execute function public.sync_provider_avatar();

-- Existing users and already accepted cast members.
update public.profiles p set avatar_url=public.provider_avatar(u.raw_user_meta_data)
 from auth.users u where u.id=p.id;
update public.cast_members c set avatar_url=p.avatar_url
 from public.profiles p where p.id=c.user_id;

create or replace function public.review_application(application_id uuid,new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare a public.applications; actor_name text; actor_avatar text;
begin
 if not public.is_admin() then raise exception 'Forbidden' using errcode='42501';end if;
 if new_status not in ('accepted','declined','submitted') then raise exception 'Invalid status';end if;
 select * into a from public.applications where id=application_id for update;
 if not found then raise exception 'Application not found';end if;
 update public.applications set status=new_status where id=application_id;
 if new_status='accepted' then
   select display_name,avatar_url into actor_name,actor_avatar from public.profiles where id=a.user_id;
   insert into public.cast_members(user_id,display_name,role_name,participation,avatar_url)
   values(a.user_id,actor_name,a.role_name,a.participation,actor_avatar)
   on conflict(user_id) do update set display_name=excluded.display_name,role_name=excluded.role_name,participation=excluded.participation,avatar_url=excluded.avatar_url;
 else delete from public.cast_members where user_id=a.user_id;
 end if;
end;
$$;
revoke all on function public.review_application(uuid,text) from public;
grant execute on function public.review_application(uuid,text) to authenticated;

commit;
