-- Migration: Confirmed ticket payment deductions for financial hardship / free / half-paid concessions
-- Replaces hardcoded VIP deductions with real dynamic per-ticket deductions
-- Restricted to designated super administrators: hasarinda986@gmail.com, hasaridnda986@gmail.com, sasinduranasinghe121@gmail.com

alter table public.reservations
  add column if not exists deduction_lkr integer not null default 0,
  add column if not exists deduction_reason text,
  add column if not exists deducted_by uuid references auth.users(id),
  add column if not exists deducted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_deduction_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_deduction_check
      check (deduction_lkr >= 0 and deduction_lkr <= amount_lkr);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_deduction_reason_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_deduction_reason_check
      check (deduction_reason is null or length(deduction_reason) <= 500);
  end if;
end;
$$;

create index if not exists reservations_deduction_lkr_idx
  on public.reservations(deduction_lkr)
  where deduction_lkr > 0;

create or replace function private.set_reservation_deduction(
  p_reservation_id uuid,
  p_deduction_lkr integer,
  p_reason text default null
)
returns public.reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_email text;
  v_reservation public.reservations;
begin
  if not private.is_admin() then
    raise exception 'Admin privileges are required to adjust deductions.' using errcode = '42501';
  end if;

  select lower(coalesce(u.email, ''))
  into v_email
  from auth.users u
  where u.id = v_admin;

  if v_email not in ('hasarinda986@gmail.com', 'hasaridnda986@gmail.com', 'sasinduranasinghe121@gmail.com') then
    raise exception 'Only designated super administrators can adjust ticket payment deductions.' using errcode = '42501';
  end if;

  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  if v_reservation.status <> 'approved' then
    raise exception 'Deductions can only be applied to confirmed tickets.' using errcode = '22023';
  end if;

  if p_deduction_lkr is null or p_deduction_lkr < 0 or p_deduction_lkr > v_reservation.amount_lkr then
    raise exception 'Deduction must be between Rs. 0 and Rs. %.', v_reservation.amount_lkr using errcode = '22023';
  end if;

  update public.reservations
  set deduction_lkr = p_deduction_lkr,
      deduction_reason = nullif(trim(p_reason), ''),
      deducted_by = case when p_deduction_lkr > 0 then v_admin else null end,
      deducted_at = case when p_deduction_lkr > 0 then now() else null end,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.set_reservation_deduction(
  p_reservation_id uuid,
  p_deduction_lkr integer,
  p_reason text default null
)
returns public.reservations
language sql security definer set search_path = ''
as $$
  select private.set_reservation_deduction(p_reservation_id, p_deduction_lkr, p_reason);
$$;

revoke all on function public.set_reservation_deduction(uuid, integer, text) from public, anon;
grant execute on function public.set_reservation_deduction(uuid, integer, text) to authenticated;
