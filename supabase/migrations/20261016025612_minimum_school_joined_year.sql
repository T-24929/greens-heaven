-- Keep historical rows intact; enforce the new range for new reservations.
begin;
alter table public.reservations add constraint reservations_joined_year_2010_check
  check (school_joined_year is null or school_joined_year between 2010 and 2026) not valid;
create or replace function private.reserve_ticket(p_full_name text, p_whatsapp text, p_nic_number text, p_school_index_number text, p_school_joined_year integer)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_reservation public.reservations;
  v_event public.event_settings;
  v_email text;
begin
  if not private.is_verified_user() then
    raise exception 'Sign in with a verified email to reserve a ticket.' using errcode = '42501';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Enter your full name (2–120 characters).' using errcode = '22023';
  end if;
  if p_nic_number is null or p_nic_number !~ '^([0-9]{9}[VX]|[0-9]{12})$' then
    raise exception 'Enter a valid Sri Lankan NIC number.' using errcode = '22023';
  end if;
  if p_school_index_number is not null and p_school_index_number !~ '^[0-9]{5}$' then
    raise exception 'Enter a valid 5-digit school index number, or leave it blank.' using errcode = '22023';
  end if;
  if p_school_joined_year is null or p_school_joined_year not between 2010 and 2026 then
    raise exception 'Choose the year you joined Isipathana College.' using errcode = '22023';
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^\+947[0-9]{8}$' then
    raise exception 'Enter a valid Sri Lankan mobile number.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_reservation from public.reservations where user_id = v_user;
  if found then return v_reservation; end if;
  select * into strict v_event from public.event_settings where id = 'greens-heaven-2026';
  if not v_event.reservations_open or v_event.starts_at <= now() then
    raise exception 'Ticket reservations are closed.' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = v_user;
  insert into public.reservations(user_id, event_id, full_name, nic_number, school_index_number,
    school_joined_year, whatsapp, email, amount_lkr)
    values (v_user, v_event.id, trim(p_full_name), p_nic_number, p_school_index_number,
      p_school_joined_year, p_whatsapp, v_email, v_event.ticket_price_lkr)
    returning * into v_reservation;
  return v_reservation;
end;
$$;


commit;
