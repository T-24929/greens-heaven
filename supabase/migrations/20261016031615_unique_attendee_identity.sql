begin;
-- A unique index is authoritative even when two requests arrive simultaneously.
-- Canonicalize legacy NICs using the DRP old-to-new number mapping:
-- https://drp.gov.lk/en/faq.php (855420159V -> 198554200159).
-- No records are deleted or merged. Existing collisions abort this migration.
do $$
begin
  if exists (
    select 1 from public.reservations
    where nic_number is not null
    group by event_id, (case when length(nic_number) = 10
      then '19' || substr(nic_number, 1, 5) || '0' || substr(nic_number, 6, 4)
      else nic_number end)
    having count(*) > 1
  ) then raise exception 'Duplicate NIC reservations exist. Review them before applying identity uniqueness.'; end if;
  if exists (
    select 1 from public.reservations where school_index_number is not null
    group by event_id, school_index_number having count(*) > 1
  ) then raise exception 'Duplicate school index reservations exist. Review them before applying identity uniqueness.'; end if;
  if exists (
    select 1 from public.reservations
    group by event_id, lower(trim(email)) having count(*) > 1
  ) then raise exception 'Duplicate email reservations exist. Review them before applying identity uniqueness.'; end if;
end;
$$;

create unique index reservations_event_nic_unique on public.reservations (
  event_id, (case when length(nic_number) = 10
    then '19' || substr(nic_number, 1, 5) || '0' || substr(nic_number, 6, 4)
    else nic_number end)
) where nic_number is not null;
create unique index reservations_event_school_index_unique
  on public.reservations (event_id, school_index_number)
  where school_index_number is not null;
create unique index reservations_event_email_unique
  on public.reservations (event_id, lower(trim(email)));
commit;
