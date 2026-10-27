export default function RefundPolicyPage() {
  return <article className="panel stack narrow" aria-labelledby="refund-policy-title">
    <div><p className="eyebrow">Greens Heaven · 31 October 2026</p><h1 id="refund-policy-title" className="page-heading">Refund policy</h1></div>
    <p className="muted text-sm">Updated 13 October 2026</p>
    <p>Please read this policy before transferring your ticket payment. One ticket costs Rs. 7,000.</p>

    <section className="stack" aria-labelledby="personal-cancellations">
      <h2 id="personal-cancellations">If you cannot attend</h2>
      <p>Payments are not refundable for personal cancellations, a change of mind, a schedule conflict, or not attending the event. Please check your plans before paying.</p>
    </section>

    <section className="stack" aria-labelledby="duplicate-payments">
      <h2 id="duplicate-payments">Duplicate payments</h2>
      <p>If you accidentally pay more than once for the same reservation, contact the organizers. Once the duplicate transfers are verified against the bank records, the extra payment will be refunded. Refunding a duplicate payment does not cancel your ticket.</p>
    </section>

    <section className="stack" aria-labelledby="event-cancellation">
      <h2 id="event-cancellation">If the organizers cancel the event</h2>
      <p>If the organizers cancel Greens Heaven, your ticket payment received by the organizers will be refunded after verification. The organizers will announce the cancellation and explain how to arrange your refund.</p>
    </section>

    <section className="stack" aria-labelledby="request-refund">
      <h2 id="request-refund">Contact the organizers</h2>
      <p>Send a message to <a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer">@greens_heaven on Instagram</a> with:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Your name, reservation reference (for example GH-001), and the email used for your reservation.</li>
        <li>The reason for your request, payment date, amount, and bank transaction reference.</li>
        <li>Your payment receipt. For a duplicate payment, include both receipts and hide unrelated transactions.</li>
      </ul>
      <p className="muted text-sm">The organizers will never need your banking password, PIN, or one-time password.</p>
      <a className="button-link self-start" href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer">Contact Greens Heaven</a>
    </section>

    <section className="stack" aria-labelledby="refund-payment">
      <h2 id="refund-payment">How refunds are returned</h2>
      <p>The organizers review requests manually and confirm the refund amount and expected transfer date with you. Approved refunds are returned to the original payer by bank transfer after the payment and recipient details have been checked. Bank processing times may vary.</p>
      <p>If an expected refund has not arrived, contact the organizers with your reservation reference so they can check the transfer.</p>
    </section>

    <section className="stack" aria-labelledby="consumer-rights">
      <h2 id="consumer-rights">Your consumer rights</h2>
      <p>This policy does not limit any rights or remedies you may have under applicable Sri Lankan law. Contact the organizers about an issue not covered here. You can also read the <a href="https://www.caa.gov.lk/web/index.php?Itemid=496&id=75&option=com_content&view=article" target="_blank" rel="noreferrer">Consumer Affairs Authority’s complaint guidance</a>.</p>
    </section>
    <a href="/">Back to the event</a>
  </article>
}
