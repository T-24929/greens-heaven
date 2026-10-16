-- Run after the migration as postgres in a LOCAL database. Everything rolls
-- back. These tests switch actual Postgres roles; they do not mock RLS.
begin;

create schema test_support;
grant usage on schema test_support to anon, authenticated, service_role;
create function test_support.ok(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'FAIL: %', p_message; end if;
end;
$$;
create function test_support.denied(p_sql text, p_state text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAIL: % (expected %, got %: %)', p_message, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (statement unexpectedly succeeded)', p_message;
end;
$$;

insert into auth.users(id, email, email_confirmed_at, is_anonymous) values
  ('10000000-0000-4000-8000-000000000001', 'attendee@example.test', now(), false),
  ('10000000-0000-4000-8000-000000000002', 'other@example.test', now(), false),
  ('10000000-0000-4000-8000-000000000003', 'admin@example.test', now(), false),
  ('10000000-0000-4000-8000-000000000004', 'unverified@example.test', null, false),
  ('10000000-0000-4000-8000-000000000005', 'anonymous@example.test', now(), true);
insert into private.admins(user_id) values ('10000000-0000-4000-8000-000000000003');
update public.event_settings set starts_at = now() + interval '1 day';

set local role anon;
select test_support.ok((select count(*) = 1 from public.event_settings), 'anonymous can read event');
select test_support.denied('select * from public.bank_details', '42501', 'anonymous cannot read bank details');
select test_support.denied('select * from public.reservations', '42501', 'anonymous cannot read reservations');
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '24929', 2013)$sql$, '42501', 'anonymous cannot reserve');
select test_support.denied($sql$select private.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '24929', 2013)$sql$, '42501', 'anonymous cannot invoke private reservation implementation');
select test_support.denied($sql$select private.is_admin()$sql$, '42501', 'anonymous cannot invoke private authorization helper');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '24929', 2013)$sql$, '42501', 'unverified email cannot reserve');
select test_support.ok((select count(*) = 0 from public.bank_details), 'unverified email cannot read bank details');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '24929', 2013)$sql$, '42501', 'anonymous auth cannot reserve');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select test_support.ok(not public.is_admin(), 'ordinary attendee has no admin access');
select test_support.ok((select count(*) = 1 from public.bank_details), 'verified attendee reads bank details');
select test_support.denied($sql$select public.reserve_ticket('X', '+94771234567', '198554200159', '24929', 2013)$sql$, '22023', 'short name rejected');
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+14155550100', '198554200159', '24929', 2013)$sql$, '22023', 'non-Sri-Lankan mobile rejected');
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+94771234567', '12345', '24929', 2013)$sql$, '22023', 'invalid NIC rejected');
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '2487', 2013)$sql$, '22023', 'invalid school index rejected');
select test_support.denied($sql$select public.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '24929', 2009)$sql$, '22023', 'school joined year outside offered range rejected');
select set_config('test.reservation_id', (public.reserve_ticket('Test Attendee', '+94771234567', '198554200159', '24929', 2013)).id::text, true);
select test_support.ok((public.reserve_ticket('Different Name', '+94770000000', '855420159V', '24875', 2014)).id::text = current_setting('test.reservation_id'), 'duplicate reserve is idempotent');
select test_support.ok((select count(*) = 1 from public.reservations), 'only one reservation per account');
select test_support.ok((select reference = 'GH-001' from public.reservations), 'reservation reference uses GH-001 numbering');
select test_support.ok((select amount_lkr = 6500 and status = 'awaiting_payment' and email = 'attendee@example.test' from public.reservations), 'server sets amount, state and trusted email');
select test_support.ok((select nic_number = '198554200159' and school_index_number = '24929' and school_joined_year = 2013 from public.reservations), 'reservation stores validated NIC, school index and joined year');
select test_support.ok((select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('event_settings', 'reservations') and column_name = 'currency')), 'event and ticket storage use fixed rupee amounts without currency selectors');
select test_support.ok((public.update_reservation_details('Updated Attendee', '+94771234567', '198554200159', '24929', 2010)).school_joined_year = 2010, 'owner edits saved details at minimum year');
select test_support.ok((select reference = 'GH-001' and amount_lkr = 6500 and status = 'awaiting_payment' from public.reservations), 'edit preserves ticket reference amount and status');
select test_support.denied($sql$select public.update_reservation_details('Updated Attendee', '+94771234567', '198554200159', '24929', 2009)$sql$, '22023', 'edit rejects joined years before 2010');
select test_support.denied('update public.reservations set amount_lkr = 1, status = ''approved''', '42501', 'attendee cannot change amount or approve');
select test_support.denied('insert into private.admins(user_id) values (auth.uid())', '42501', 'attendee cannot grant admin access');
select test_support.denied($sql$select public.review_reservation(current_setting('test.reservation_id')::uuid, 'approved', 'unused')$sql$, '42501', 'attendee cannot invoke review');
select test_support.denied($sql$select public.claim_notification(gen_random_uuid())$sql$, '42501', 'attendee cannot claim email');
select test_support.denied($sql$select private.claim_notification(gen_random_uuid())$sql$, '42501', 'attendee cannot invoke private email claim');
select test_support.denied($sql$select public.submit_receipt(current_setting('test.reservation_id')::uuid, 'missing.pdf')$sql$, '22023', 'invalid receipt paths rejected');
select set_config('test.receipt_path', auth.uid()::text || '/' || current_setting('test.reservation_id') || '/20000000-0000-4000-8000-000000000001.pdf', true);
select test_support.denied($sql$select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path'))$sql$, '22023', 'missing uploaded object cannot submit');

-- Metadata is set by the Storage API in production. In this local test a
-- direct insert exercises the same storage.objects RLS policy.
insert into storage.objects(bucket_id, name, owner_id, metadata) values
  ('receipts', current_setting('test.receipt_path'), auth.uid()::text, '{"mimetype":"application/pdf","size":1000}');
select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path'));
select test_support.ok((select status = 'pending_review' from public.reservations), 'receipt moves ticket to pending review');
select test_support.denied($sql$select public.update_reservation_details('Updated Attendee', '+94771234567', '198554200159', '24929', 2010)$sql$, '22023', 'details locked during review');
select test_support.ok((select count(*) = 1 from public.receipt_submissions), 'receipt audit row exists');
select test_support.ok((public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path'))).status = 'pending_review', 'same pending receipt submission is idempotent after network retry');
select test_support.ok((select count(*) = 1 from public.receipt_submissions), 'idempotent submission does not duplicate history');
select test_support.denied($sql$select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path') || '.pdf')$sql$, '22023', 'different pending receipt cannot replace current evidence');
with deleted as (delete from storage.objects where name = current_setting('test.receipt_path') returning *)
  select test_support.ok(count(*) = 0, 'receipt object cannot be deleted') from deleted;
with changed as (update storage.objects set metadata = '{}' where name = current_setting('test.receipt_path') returning *)
  select test_support.ok(count(*) = 0, 'receipt object cannot be overwritten') from changed;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select test_support.denied($sql$select public.update_reservation_details('Updated Attendee', '+94771234567', '198554200159', '24929', 2010)$sql$, '42501', 'other attendee cannot edit first attendee reservation');
select test_support.ok((select count(*) = 0 from public.reservations), 'other account cannot read attendee reservation');
select test_support.ok((select count(*) = 0 from public.receipt_submissions), 'other account cannot read receipt history');
select test_support.ok((select count(*) = 0 from storage.objects where name = current_setting('test.receipt_path')), 'other account cannot access receipt bytes');
select test_support.denied($sql$select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path'))$sql$, '42501', 'other account cannot submit for owner');
select test_support.denied($sql$insert into storage.objects(bucket_id,name,owner_id,metadata) values ('receipts',current_setting('test.receipt_path') || '.pdf',auth.uid()::text,'{}')$sql$, '42501', 'other account cannot upload to owner folder');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select test_support.ok(public.is_admin(), 'protected membership grants admin access');
select test_support.ok((select count(*) = 1 from public.reservations), 'admin reads queue');
select test_support.ok((select count(*) = 1 from storage.objects where name = current_setting('test.receipt_path')), 'admin reads private receipt');
select test_support.denied('update public.reservations set status = ''approved''', '42501', 'admin also cannot bypass review RPC');
select test_support.denied($sql$select public.review_reservation(current_setting('test.reservation_id')::uuid, 'rejected', current_setting('test.receipt_path'), null)$sql$, '22023', 'rejection requires reason');
select set_config('test.rejection_notification_id', (public.review_reservation(current_setting('test.reservation_id')::uuid, 'rejected', current_setting('test.receipt_path'), 'Please upload a clear bank receipt.')->>'notification_id'), true);
select test_support.ok((select status = 'rejected' from public.reservations), 'admin rejects receipt');
select test_support.ok((select count(*) = 1 from public.review_history), 'review creates immutable audit row');
select test_support.ok((select count(*) = 1 from public.notification_outbox where status = 'pending'), 'review queues one email atomically');
select test_support.denied($sql$select public.review_reservation(current_setting('test.reservation_id')::uuid, 'approved', current_setting('test.receipt_path'))$sql$, '22023', 'duplicate review cannot queue email twice');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select test_support.denied($sql$select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path'))$sql$, '22023', 'rejected receipt cannot be replayed unchanged');
select set_config('test.receipt_path_2', auth.uid()::text || '/' || current_setting('test.reservation_id') || '/20000000-0000-4000-8000-000000000002.png', true);
insert into storage.objects(bucket_id, name, owner_id, metadata) values
  ('receipts', current_setting('test.receipt_path_2'), auth.uid()::text, '{"mimetype":"image/png","size":1000}');
select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path_2'));
select test_support.ok((select status = 'pending_review' and review_note is null and reviewed_at is null from public.reservations), 'new receipt returns rejected ticket to review');
select test_support.ok((select count(*) = 2 from public.receipt_submissions), 'prior receipt evidence preserved');
reset role;

set local role service_role;
select test_support.ok((select count(*) = 0 from public.claim_notification(current_setting('test.rejection_notification_id')::uuid)), 'obsolete rejection email cannot be claimed after resubmit');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select test_support.denied($sql$select public.review_reservation(current_setting('test.reservation_id')::uuid, 'approved', current_setting('test.receipt_path'))$sql$, '22023', 'stale admin cannot approve a replaced receipt');
select set_config('test.notification_id', (public.review_reservation(current_setting('test.reservation_id')::uuid, 'approved', current_setting('test.receipt_path_2'))->>'notification_id'), true);
select test_support.ok((select count(*) = 2 from public.review_history), 'both decisions stay in audit');
select test_support.ok((select status = 'approved' and receipt_path = current_setting('test.receipt_path_2') from public.reservations), 'admin approves current receipt');
reset role;

set local role service_role;
select set_config('test.claim_token', (select claim_token::text from public.claim_notification(current_setting('test.notification_id')::uuid)), true);
select test_support.ok((select count(*) = 0 from public.claim_notification(current_setting('test.notification_id')::uuid)), 'a second worker cannot claim sending email');
select test_support.ok(not public.finish_notification(current_setting('test.notification_id')::uuid, gen_random_uuid(), 'sent'), 'wrong claim token cannot finalize');
select test_support.ok(public.finish_notification(current_setting('test.notification_id')::uuid, current_setting('test.claim_token')::uuid, 'failed', 'SMTP rejected recipient'), 'definite send failure can be recorded');
select set_config('test.claim_token', (select claim_token::text from public.claim_notification(current_setting('test.notification_id')::uuid)), true);
select test_support.ok((select attempts = 2 from public.notification_outbox where id = current_setting('test.notification_id')::uuid), 'definite failure can be retried with new token');
select test_support.ok(public.finish_notification(current_setting('test.notification_id')::uuid, current_setting('test.claim_token')::uuid, 'unknown', 'Connection lost after message transfer'), 'ambiguous send result is recorded separately');
select test_support.ok((select count(*) = 0 from public.claim_notification(current_setting('test.notification_id')::uuid)), 'ambiguous SMTP delivery cannot automatically resend');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select test_support.denied($sql$select public.submit_receipt(current_setting('test.reservation_id')::uuid, current_setting('test.receipt_path_2'))$sql$, '22023', 'approved ticket cannot be reopened by attendee');
select test_support.denied($sql$insert into storage.objects(bucket_id,name,owner_id,metadata) values ('receipts',auth.uid()::text || '/' || current_setting('test.reservation_id') || '/20000000-0000-4000-8000-000000000003.pdf',auth.uid()::text,'{}')$sql$, '42501', 'approved reservation accepts no new upload');
reset role;

-- Closed sales, missing bank setup, upload quotas, and stored metadata checks.
update public.event_settings set reservations_open = false;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select test_support.denied($sql$select public.reserve_ticket('Other Attendee', '+94776543210', '198554200159', '24929', 2013)$sql$, '22023', 'closed sales reject new reservations');
reset role;
update public.event_settings set reservations_open = true;
delete from public.bank_details;
set local role authenticated;
select test_support.denied($sql$select public.reserve_ticket('Other Attendee', '+94776543210', '198554200159', null, 2013)$sql$, '23505', 'different account cannot reuse NIC');
select test_support.denied($sql$select public.reserve_ticket('Other Attendee', '+94776543210', '855420159V', null, 2013)$sql$, '23505', 'old and new NIC represent the same identity');
select test_support.denied($sql$select public.reserve_ticket('Other Attendee', '+94776543210', '200712345678', '24929', 2013)$sql$, '23505', 'different account cannot reuse school index');
select set_config('test.other_reservation_id', (public.reserve_ticket('Updated Attendee', '+94771234567', '200712345678', null, 2013)).id::text, true);
select test_support.ok((select status = 'awaiting_payment' from public.reservations), 'can reserve before bank details are configured');
select test_support.ok((select nic_number = '200712345678' and school_index_number is null and school_joined_year = 2013 from public.reservations where id = current_setting('test.other_reservation_id')::uuid), 'school index is optional');
select test_support.denied($sql$insert into storage.objects(bucket_id,name,owner_id,metadata) values ('receipts',auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/20000000-0000-4000-8000-000000000003.pdf',auth.uid()::text,'{}')$sql$, '42501', 'missing bank details block upload');
reset role;
insert into public.bank_details(event_id,bank_name,account_name,account_number)
  values ('greens-heaven-2026','Demo bank','Demo account','DEMO');
set local role authenticated;
select test_support.denied($sql$insert into storage.objects(bucket_id,name,owner_id,metadata) values ('receipts',auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/20000000-0000-4000-8000-000000000003.pdf','10000000-0000-4000-8000-000000000001','{}')$sql$, '42501', 'object owner cannot be forged');
insert into storage.objects(bucket_id,name,owner_id,metadata)
select 'receipts', auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/'
  || lpad(i::text,8,'0') || '-0000-4000-8000-000000000009.pdf', auth.uid()::text,
  jsonb_build_object('mimetype',case when i = 3 then 'text/html' else 'application/pdf' end,
    'size',case when i = 1 then 5242881 when i = 2 then 0 else 1000 end)
from generate_series(1,10) as series(i);
select test_support.ok((select count(*) = 10 from storage.objects where split_part(name,'/',2) = current_setting('test.other_reservation_id')), 'ten receipt objects allowed per reservation');
select test_support.denied($sql$insert into storage.objects(bucket_id,name,owner_id,metadata) values ('receipts',auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/20000000-0000-4000-8000-000000000099.pdf',auth.uid()::text,'{}')$sql$, '42501', 'eleventh object rejected by quota');
select test_support.denied($sql$select public.submit_receipt(current_setting('test.other_reservation_id')::uuid, auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/00000001-0000-4000-8000-000000000009.pdf')$sql$, '22023', 'oversize object rejected on submission');
select test_support.denied($sql$select public.submit_receipt(current_setting('test.other_reservation_id')::uuid, auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/00000002-0000-4000-8000-000000000009.pdf')$sql$, '22023', 'zero byte object rejected on submission');
select test_support.denied($sql$select public.submit_receipt(current_setting('test.other_reservation_id')::uuid, auth.uid()::text || '/' || current_setting('test.other_reservation_id') || '/00000003-0000-4000-8000-000000000009.pdf')$sql$, '22023', 'disallowed object MIME type rejected on submission');
reset role;

select test_support.ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.event_settings'::regclass, 'public.bank_details'::regclass, 'public.reservations'::regclass,
   'public.receipt_submissions'::regclass, 'public.review_history'::regclass,
   'public.notification_outbox'::regclass, 'private.admins'::regclass)), 'every application table enables RLS');
select test_support.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proname in ('reserve_ticket','submit_receipt','review_reservation','is_admin','claim_notification','finish_notification')), 'public RPCs remain security invoker');


reset role;
select test_support.denied($sql$update public.reservations set email = 'ATTENDEE@example.test' where id = current_setting('test.other_reservation_id')::uuid$sql$, '23505', 'email uniqueness ignores case');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select test_support.denied($sql$select public.update_reservation_details('Other Attendee', '+94776543210', '198554200159', null, 2013)$sql$, '23505', 'editing cannot reuse another NIC');
select test_support.denied($sql$select public.update_reservation_details('Other Attendee', '+94776543210', '200712345678', '24929', 2013)$sql$, '23505', 'editing cannot reuse another school index');
select test_support.ok((select nic_number = '200712345678' and school_index_number is null from public.reservations), 'failed duplicate edit keeps original values');
reset role;

-- Event attendance: authorization, independent gates and idempotent scans.
set local role anon;
select test_support.denied($sql$select public.lookup_event_ticket('GH-001')$sql$,'42501','anonymous cannot look up tickets');
select test_support.denied($sql$select public.admin_event_summary()$sql$,'42501','anonymous cannot read admin totals');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select test_support.denied($sql$select public.lookup_event_ticket(current_setting('test.reservation_id'))$sql$,'42501','attendee cannot use event desk lookup');
select test_support.denied($sql$select public.check_in_ticket(current_setting('test.reservation_id')::uuid,'entrance')$sql$,'42501','attendee cannot check themselves in');
select test_support.ok((select count(*)=0 from public.ticket_attendance),'attendee cannot read gate log');
select test_support.denied($sql$insert into public.ticket_attendance(reservation_id,gate,checked_in_by) values(current_setting('test.reservation_id')::uuid,'entrance',auth.uid())$sql$,'42501','direct attendance insert forbidden');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select test_support.denied($sql$select public.check_in_ticket(current_setting('test.other_reservation_id')::uuid,'entrance')$sql$,'22023','unapproved ticket cannot check in');
select test_support.denied($sql$select public.check_in_ticket(current_setting('test.reservation_id')::uuid,'other')$sql$,'22023','unknown gate rejected');
select test_support.denied($sql$select public.check_in_ticket(current_setting('test.reservation_id')::uuid,'photobooth',false)$sql$,'22023','photo booth requires ID check');
select test_support.ok((public.lookup_event_ticket(current_setting('test.reservation_id'))->>'status')='approved','desk reads authoritative approval');
select test_support.ok(not (public.lookup_event_ticket(current_setting('test.reservation_id')) ? 'nic_number'),'desk lookup does not expose NIC');
select test_support.ok((public.check_in_ticket(current_setting('test.reservation_id')::uuid,'photobooth',true)->>'already_recorded')='false','photo booth can record independently of entrance');
select test_support.ok((select count(*)=0 from public.ticket_attendance where gate='entrance'),'photo session does not mark entrance');
select test_support.ok((public.check_in_ticket(current_setting('test.reservation_id')::uuid,'entrance')->>'already_recorded')='false','entrance recorded separately');
select set_config('test.entrance_time',(select checked_in_at::text from public.ticket_attendance where gate='entrance'),true);
select test_support.ok((public.check_in_ticket(current_setting('test.reservation_id')::uuid,'entrance')->>'already_recorded')='true','duplicate entrance is idempotent');
select test_support.ok((select checked_in_at::text=current_setting('test.entrance_time') from public.ticket_attendance where gate='entrance'),'repeat scan preserves first timestamp');
select test_support.ok((select count(*)=2 from public.ticket_attendance),'one immutable record per gate');
select test_support.ok((select bool_and(checked_in_by=auth.uid()) from public.ticket_attendance),'check-in staff recorded from auth context');
select test_support.denied($sql$delete from public.ticket_attendance$sql$,'42501','admin cannot erase attendance through API');
select test_support.ok((public.admin_event_summary()->>'entrance')='1','summary counts entrance');
select test_support.ok((public.admin_event_summary()->>'photobooth')='1','summary counts photo booth');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select test_support.ok((select count(*)=0 from public.ticket_attendance),'attendee cannot see recorded attendance');
select test_support.denied($sql$select public.add_admin('10000000-0000-4000-8000-000000000004'::uuid)$sql$,'42501','ordinary attendee cannot invoke add_admin');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select test_support.ok(public.add_admin('10000000-0000-4000-8000-000000000004'::uuid),'admin can assign new admin by UID');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select test_support.denied($sql$select * from public.get_admins()$sql$,'42501','ordinary attendee cannot call get_admins');
select test_support.denied($sql$select public.add_admin_by_email('other@example.com')$sql$,'42501','ordinary attendee cannot call add_admin_by_email');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select test_support.ok((select count(*) >= 2 from public.get_admins()),'admin can retrieve admins directory');
select test_support.ok((select exists (select 1 from public.get_admins() where user_id is not null and email is not null and in_private_admins is true)),'get_admins returns user_id, email, in_private_admins');
select test_support.ok((select exists (select 1 from public.review_history where admin_id = '10000000-0000-4000-8000-000000000003'::uuid)),'review_history records reviewer admin_id uuid');
select test_support.ok((select exists (select 1 from public.reservations where reviewed_by = '10000000-0000-4000-8000-000000000003'::uuid)),'reservations records reviewed_by uuid');

reset role;
rollback;
