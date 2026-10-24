create or replace function public.event_ticket_availability()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_tickets', 150,
    'approved_tickets', coalesce((select count(*) from public.reservations where status = 'approved'), 0),
    'tickets_left', greatest(0, 150 - coalesce((select count(*) from public.reservations where status = 'approved'), 0)),
    'sold_out', coalesce((select count(*) from public.reservations where status = 'approved'), 0) >= 150
  );
$$;

revoke all on function public.event_ticket_availability() from public, anon, authenticated, service_role;
grant execute on function public.event_ticket_availability() to anon, authenticated, service_role;
