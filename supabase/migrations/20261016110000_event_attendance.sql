begin;
-- Immutable, independent gate records. Only a server-side admin RPC may write.
create table public.ticket_attendance (
  reservation_id uuid not null references public.reservations(id),
  gate text not null check (gate in ('entrance','photobooth')),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid not null references auth.users(id),
  identity_checked boolean not null default false,
  primary key (reservation_id, gate),
  check (gate <> 'photobooth' or identity_checked)
);
create index ticket_attendance_gate_time_idx on public.ticket_attendance(gate, checked_in_at desc);
alter table public.ticket_attendance enable row level security;
revoke all on public.ticket_attendance from anon, authenticated;
grant select on public.ticket_attendance to authenticated;
create policy attendance_admin_read on public.ticket_attendance for select to authenticated using ((select private.is_admin()));

create function private.lookup_event_ticket(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservations;
begin
  if not private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_code is null or length(trim(p_code)) > 100 then raise exception 'Enter a ticket reference or scan a ticket QR.' using errcode='22023'; end if;
  select * into r from public.reservations where id::text = trim(p_code) or reference = upper(trim(p_code));
  if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
  return jsonb_build_object('id',r.id,'reference',r.reference,'full_name',r.full_name,'status',r.status,
    'attendance',coalesce((select jsonb_agg(jsonb_build_object('gate',a.gate,'checked_in_at',a.checked_in_at,'identity_checked',a.identity_checked)) from public.ticket_attendance a where a.reservation_id=r.id),'[]'::jsonb));
end $$;
create function public.lookup_event_ticket(p_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.lookup_event_ticket(p_code); $$;

create function private.check_in_ticket(p_reservation_id uuid,p_gate text,p_identity_checked boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reservations; a public.ticket_attendance; inserted boolean;
begin
  if not private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
  if p_gate is null or p_gate not in ('entrance','photobooth') then raise exception 'Choose entrance or photo booth.' using errcode='22023'; end if;
  if p_gate='photobooth' and p_identity_checked is distinct from true then raise exception 'Check the attendee ID before recording a photo session.' using errcode='22023'; end if;
  select * into r from public.reservations where id=p_reservation_id for update;
  if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
  if r.status <> 'approved' then raise exception 'This ticket is not confirmed. Check payment approval first.' using errcode='22023'; end if;
  insert into public.ticket_attendance(reservation_id,gate,checked_in_by,identity_checked)
    values(r.id,p_gate,auth.uid(),coalesce(p_identity_checked,false)) on conflict do nothing returning * into a;
  inserted := found;
  if not inserted then select * into a from public.ticket_attendance where reservation_id=r.id and gate=p_gate; end if;
  return jsonb_build_object('already_recorded',not inserted,'gate',a.gate,'checked_in_at',a.checked_in_at,'reference',r.reference);
end $$;
create function public.check_in_ticket(p_reservation_id uuid,p_gate text,p_identity_checked boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select private.check_in_ticket(p_reservation_id,p_gate,p_identity_checked); $$;

create function private.admin_event_summary() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 return jsonb_build_object('total',(select count(*) from public.reservations),
 'pending_review',(select count(*) from public.reservations where status='pending_review'),
 'approved',(select count(*) from public.reservations where status='approved'),
 'awaiting_payment',(select count(*) from public.reservations where status='awaiting_payment'),
 'rejected',(select count(*) from public.reservations where status='rejected'),
 'entrance',(select count(*) from public.ticket_attendance where gate='entrance'),
 'photobooth',(select count(*) from public.ticket_attendance where gate='photobooth'),
 'email_attention',(select count(*) from public.notification_outbox where status in ('failed','unknown','pending')));
end $$;
create function public.admin_event_summary() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_event_summary(); $$;
revoke all on function private.lookup_event_ticket(text),public.lookup_event_ticket(text),private.check_in_ticket(uuid,text,boolean),public.check_in_ticket(uuid,text,boolean),private.admin_event_summary(),public.admin_event_summary() from public,anon,authenticated,service_role;
grant execute on function private.lookup_event_ticket(text),public.lookup_event_ticket(text),private.check_in_ticket(uuid,text,boolean),public.check_in_ticket(uuid,text,boolean),private.admin_event_summary(),public.admin_event_summary() to authenticated;
commit;
