-- Run this complete file once in Supabase SQL Editor as the project owner.
-- These club_* tables deliberately avoid the incomplete earlier draft tables.
-- Existing unrelated tables and their data are not changed.
begin;
create table if not exists public.club_records (
 id text primary key check (length(id) between 1 and 100),
 kind text not null check(kind in ('settings','members','meetings','notices','transactions','activities','gallery')),
 data jsonb not null check(jsonb_typeof(data)='object'),
 version integer not null default 1 check(version>0),
 attendance_version integer not null default 0 check(attendance_version>=0),
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 constraint club_settings_id check ((kind='settings' and id='settings') or (kind<>'settings' and id<>'settings')),
 constraint club_positive_amount check(kind<>'transactions' or coalesce(
   jsonb_typeof(data->'amount')='number' and (data->>'amount')::numeric>0 and
   (data->>'amount')::numeric<=1000000000 and (data->>'amount')::numeric=round((data->>'amount')::numeric,2) and
   data->>'type' in ('Income','Expense'), false))
);
create index if not exists club_records_kind_deleted on public.club_records(kind,deleted);
create unique index if not exists club_unique_member_id on public.club_records(lower(data->>'memberId')) where kind='members' and deleted=false;
create table if not exists public.club_attendance (
 meeting_id text not null references public.club_records(id) on delete restrict,
 member_id text not null references public.club_records(id) on delete restrict,
 member_name text not null,
 status text not null check(status in ('Present','Absent','Excused')),
 updated_at timestamptz not null default now(),
 primary key(meeting_id,member_id)
);
create index if not exists club_attendance_member on public.club_attendance(member_id);
create table if not exists public.club_admins (
 email text primary key check(email=lower(email) and position('@' in email)>1),
 active boolean not null default true,
 added_by text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.club_audit_logs (
 id bigint generated always as identity primary key,
 record_id text not null,
 actor_id uuid not null,
 actor_email text not null,
 action text not null,
 previous_data jsonb,
 new_data jsonb,
 created_at timestamptz not null default now()
);
create index if not exists club_audit_record on public.club_audit_logs(record_id,created_at);
-- Browser users cannot read/write raw tables, even after Google sign-in.
-- All access uses server-only API routes after verified Google identity and admin authorization.
alter table public.club_records enable row level security;
alter table public.club_attendance enable row level security;
alter table public.club_admins enable row level security;
alter table public.club_audit_logs enable row level security;
revoke all on public.club_records,public.club_attendance,public.club_admins,public.club_audit_logs from anon,authenticated;
grant select,insert,update,delete on public.club_records,public.club_attendance,public.club_admins,public.club_audit_logs to service_role;
grant usage,select on sequence public.club_audit_logs_id_seq to service_role;

create or replace function public.club_write_record(
 p_action text,p_id text,p_kind text,p_expected integer,p_data jsonb,
 p_actor uuid,p_actor_email text,p_admin_emails text[] default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 old public.club_records%rowtype;
 row_exists boolean;
 saved public.club_records%rowtype;
 payload jsonb;
 previous_admins jsonb;
begin
 if p_action not in ('save','delete','restore') or p_kind not in ('settings','members','meetings','notices','transactions','activities','gallery') or p_id is null or p_expected<0 or p_actor is null or p_actor_email is null then raise exception 'CLUB_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtext('club:'||p_id));
 select * into old from public.club_records where id=p_id for update;
 row_exists:=found;
 if row_exists and (old.kind<>p_kind or old.version<>p_expected) then raise exception 'CLUB_CONFLICT'; end if;
 if not row_exists and p_expected<>0 then raise exception 'CLUB_NOT_FOUND'; end if;
 if p_admin_emails is not null and p_kind<>'settings' then raise exception 'CLUB_INVALID'; end if;
 if p_action in ('delete','restore') then
   if p_kind='settings' then raise exception 'CLUB_INVALID'; end if;
   if not row_exists then raise exception 'CLUB_NOT_FOUND'; end if;
   update public.club_records set deleted=(p_action='delete'),version=version+1,updated_at=now() where id=p_id returning * into saved;
 else
   if jsonb_typeof(p_data)<>'object' or (row_exists and old.deleted) then raise exception 'CLUB_INVALID'; end if;
   payload:=p_data-'adminEmails';
   if p_kind='transactions' then
     payload:=payload||jsonb_build_object('recordedBy',case when row_exists then coalesce(old.data->>'recordedBy',p_actor_email) else p_actor_email end);
   end if;
   if row_exists then
     update public.club_records set data=payload,version=version+1,updated_at=now() where id=p_id returning * into saved;
   else
     insert into public.club_records(id,kind,data) values(p_id,p_kind,payload) returning * into saved;
   end if;
   -- Only the owner route passes a non-null administrator list.
   if p_admin_emails is not null then
     if cardinality(p_admin_emails)>10 then raise exception 'CLUB_INVALID'; end if;
     select coalesce(jsonb_agg(email),'[]'::jsonb) into previous_admins from public.club_admins where active;
     update public.club_admins set active=false,updated_at=now() where not(email=any(p_admin_emails));
     insert into public.club_admins(email,active,added_by) select lower(trim(e)),true,p_actor_email from unnest(p_admin_emails) as e
       on conflict(email) do update set active=true,updated_at=now();
     insert into public.club_audit_logs(record_id,actor_id,actor_email,action,previous_data,new_data)
       values('admins',p_actor,p_actor_email,'approve_admins',previous_admins,to_jsonb(p_admin_emails));
   end if;
 end if;
 insert into public.club_audit_logs(record_id,actor_id,actor_email,action,previous_data,new_data)
   values(p_id,p_actor,p_actor_email,p_action,case when row_exists then to_jsonb(old) else null end,to_jsonb(saved));
 return jsonb_build_object('id',saved.id,'version',saved.version);
end $$;

create or replace function public.club_save_attendance(
 p_meeting_id text,p_expected integer,p_rows jsonb,p_actor uuid,p_actor_email text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 meeting public.club_records%rowtype;
 old_rows jsonb;
 result_version integer;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'CLUB_INVALID'; end if;
 select * into meeting from public.club_records where id=p_meeting_id and kind='meetings' and not deleted for update;
 if not found then raise exception 'CLUB_NOT_FOUND'; end if;
 if meeting.attendance_version<>p_expected then raise exception 'CLUB_CONFLICT'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) e where coalesce(e->>'status','') not in ('Present','Absent','Excused') or e->>'memberId' is null) then raise exception 'CLUB_INVALID'; end if;
 if (select count(*)<>count(distinct e->>'memberId') from jsonb_array_elements(p_rows) e) then raise exception 'CLUB_INVALID'; end if;
 -- Include all active members and everyone already recorded for this meeting.
 if exists(
   select 1 from public.club_records m where m.kind='members' and
   ((not m.deleted and m.data->>'status'='Active') or exists(select 1 from public.club_attendance a where a.meeting_id=p_meeting_id and a.member_id=m.id))
   and not exists(select 1 from jsonb_array_elements(p_rows) e where e->>'memberId'=m.id)
 ) then raise exception 'CLUB_MEMBER_LIST'; end if;
 if exists(
   select 1 from jsonb_array_elements(p_rows) e where not exists(
     select 1 from public.club_records m where m.id=e->>'memberId' and m.kind='members' and
     ((not m.deleted and m.data->>'status'='Active') or exists(select 1 from public.club_attendance a where a.meeting_id=p_meeting_id and a.member_id=m.id))
   )
 ) then raise exception 'CLUB_MEMBER_LIST'; end if;
 select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into old_rows from public.club_attendance a where meeting_id=p_meeting_id;
 insert into public.club_attendance(meeting_id,member_id,member_name,status)
   select p_meeting_id,m.id,m.data->>'name',e->>'status' from jsonb_array_elements(p_rows) e join public.club_records m on m.id=e->>'memberId'
   on conflict(meeting_id,member_id) do update set status=excluded.status,updated_at=now();
 update public.club_records set attendance_version=attendance_version+1,updated_at=now() where id=p_meeting_id returning attendance_version into result_version;
 insert into public.club_audit_logs(record_id,actor_id,actor_email,action,previous_data,new_data) values(p_meeting_id,p_actor,p_actor_email,'attendance',old_rows,p_rows);
 return jsonb_build_object('version',result_version);
end $$;

revoke all on function public.club_write_record(text,text,text,integer,jsonb,uuid,text,text[]) from public,anon,authenticated;
revoke all on function public.club_save_attendance(text,integer,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.club_write_record(text,text,text,integer,jsonb,uuid,text,text[]) to service_role;
grant execute on function public.club_save_attendance(text,integer,jsonb,uuid,text) to service_role;
-- The owner email is set privately in Vercel as CLUB_OWNER_EMAIL.
-- No "first user becomes owner" trigger or public signup privilege exists.
insert into public.club_records(id,kind,data) values ('settings','settings',
'{"name":"Karyabinayak Sanskriti Yuba Club","nepaliName":"कार्यबिनायक संस्कृति युवा क्लब","logo":"","about":"युवा सहभागिता, संस्कृति संरक्षण र सामाजिक सेवाका लागि एकजुट समुदाय।","history":"Placeholder: Add the story of how our club began.","mission":"Placeholder: Describe the club’s mission for the community.","objectives":"Placeholder: Add the club’s main objectives.","address":"Bhaisepati–25, Lalitpur","phone":"","email":"","established":"2083 BS","facebook":"","social":""}'::jsonb) on conflict(id) do nothing;
-- Private bucket; no anon/authenticated Storage policies are granted.
-- Images are served only through /api/images/[id], which checks publication/admin status.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('club-photos','club-photos',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
commit;
