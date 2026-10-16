# Event-day desk

Apply `supabase/migrations/20261016110000_event_attendance.sql` after the earlier migrations before using the new admin overview or gate desks. Deploy the updated site and its `_headers` file to allow camera access on your own origin.

Only verified accounts listed in `private.admins` can use these desks. This version does not introduce separate photographer or gate-only roles. Give access only to trusted organizers; photographers can receive the ticket ID from an organizer without an admin login.

## Reviews and updates

The overview shows current reservation counts. Tickets can be filtered by status and searched by name or reference. Open a reservation to inspect receipts, approve or request a replacement, view review history and check email delivery. Updates is the delivery inbox; it does not send browser push notifications. Totals refresh every 30 seconds while the tab is visible.

## Entrance

Open Entrance, start the camera and scan the attendee's ticket QR. Alternatively enter `GH-003`. Verify the displayed attendee and confirm check-in. A successful record is returned by the database; losing the connection must never be treated as admission confirmation. Look up the ticket again after an uncertain result.

## Photo booth

Open Photos and scan the same QR. Check the attendee's physical ID against the displayed name, select the ID-check box and confirm the session. Copy the ticket reference for naming the photo folder. The system records that staff checked ID; it does not scan or store an ID image, verify a government record or upload photographs. Photographers manage their own files.

Entrance and photo booth each allow one recorded attendance per ticket. Neither implies the other. Repeat scans show the original timestamp and cannot create another attendance. Only approved tickets can be recorded. Staff identity and server time are saved with each record; there is no destructive reset button.

## Before the event

Test on a real iPhone and Android phone over HTTPS, with camera permission allowed and denied, in low light and on a slow connection. Check the same test ticket at both gates, then scan it again. Chrome/WebKit automation cannot establish real camera quality or event-day network reliability. Keep a staffed manual lookup desk for attendees whose QR is unavailable.

The QR identifies a ticket; it is not proof of identity. A copied QR can point to the same record, so operators should check the person against the displayed name. The database prevents duplicate gate records.
