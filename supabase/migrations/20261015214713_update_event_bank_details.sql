-- Organizer-provided receiving account. Run against the Greens Heaven project.
-- Existing permissions remain unchanged: verified attendees can read these details.
begin;

update public.bank_details
set bank_name = 'Pan Asia Bank',
    account_name = 'K K V N C Kariyawasam',
    account_number = '207610002552',
    branch = 'Homagama',
    payment_instructions = 'Use your GH reservation reference as the transfer reference. Upload a clear payment receipt after transferring the ticket amount.',
    is_demo = false
where event_id = 'greens-heaven-2026';

do $$
begin
  if not exists (
    select 1 from public.bank_details
    where event_id = 'greens-heaven-2026'
      and bank_name = 'Pan Asia Bank'
      and account_name = 'K K V N C Kariyawasam'
      and account_number = '207610002552'
      and branch = 'Homagama'
      and is_demo = false
  ) then
    raise exception 'Greens Heaven bank details were not updated. Apply the initial ticketing migration first.';
  end if;
end;
$$;

commit;
