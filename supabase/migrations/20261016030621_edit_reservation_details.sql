begin;
create or replace function private.update_reservation_details(p_full_name text, p_whatsapp text, p_nic_number text, p_school_index_number text, p_school_joined_year integer)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_reservation public.reservations;
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
  select * into v_reservation from public.reservations where user_id = v_user for update;
  if not found then raise exception 'Reservation not found.' using errcode = '42501'; end if;
  if v_reservation.status not in ('awaiting_payment', 'rejected') then
    raise exception 'Reservation status no longer allows changes.' using errcode = '22023';
  end if;
  update public.reservations set full_name = trim(p_full_name), whatsapp = p_whatsapp,
    nic_number = p_nic_number, school_index_number = p_school_index_number,
    school_joined_year = p_school_joined_year, updated_at = now()
    where id = v_reservation.id returning * into v_reservation;
  return v_reservation;
end;
$$;

create function public.update_reservation_details(p_full_name text, p_whatsapp text, p_nic_number text, p_school_index_number text, p_school_joined_year integer)
returns public.reservations language sql security invoker set search_path = ''
as $$ select private.update_reservation_details(p_full_name, p_whatsapp, p_nic_number, p_school_index_number, p_school_joined_year); $$;
revoke all on function private.update_reservation_details(text,text,text,text,integer),
  public.update_reservation_details(text,text,text,text,integer) from public, anon, authenticated, service_role;
grant execute on function private.update_reservation_details(text,text,text,text,integer),
  public.update_reservation_details(text,text,text,text,integer) to authenticated;
commit;
