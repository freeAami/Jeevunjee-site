import { CONTACT_EMAIL, PRIVACY_APPROVED } from '../content';

/** Privacy notice and data retention (#/privacy). The wording is a draft until the trustees approve it. */
export function Privacy() {
  return (
    <main id="main" className="privacy">
      <a href="#" className="privacy-back">← Back to the site</a>
      {!PRIVACY_APPROVED && (
        <p className="privacy-draft" role="note">
          Draft for the trustees to check. It is not linked from the site until they approve it.
        </p>
      )}
      <h1>Privacy notice</h1>
      <p>
        This notice explains what the Jeevunjee Family Scholarship does with the information you give us, and how long
        we keep it. The scholarship is run by the Jeevunjee family through the Rukan Trust and the Y A J Noorbhai
        Trust (“we”). We follow Sri Lanka’s Personal Data Protection Act, No. 9 of 2022.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Who you are: name, date of birth, photo, national ID or passport, phone, email and city.</li>
        <li>Your studies: schools, results, the course you want to take, where, and what it costs.</li>
        <li>Your family situation and household income, and any documents you upload to show them.</li>
        <li>If you get a scholarship: your payment schedule, payments made, and invoices, cheques and receipts.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To decide on your application, and to contact you about it.</li>
        <li>If you are supported: to pay fees, keep records of payments, and remind you when payments are due.</li>
        <li>We never sell your information, use it for advertising, or share it outside the trusts except as below.</li>
      </ul>
      <p>We use it because you ask us to consider your application and agree to this notice when you apply.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>The trustees. Each has their own login, and every new trustee login is announced to the others.</li>
        <li>You, if you get a scholarship: your student login shows only your own file.</li>
        <li>
          Services that store it or send emails for us, under their own security terms: Supabase (the database and
          documents), Google (email and the applications sheet) and Netlify (the website). Their servers may be
          outside Sri Lanka.
        </li>
      </ul>

      <h2 id="retention">How long we keep it</h2>
      <ul>
        <li>Applications that don’t go ahead: deleted, with their documents, once the trustees have finished with that round.</li>
        <li>Students: kept while you are supported, and afterwards for as long as the trusts need payment records for their accounts.</li>
        <li>Notification emails and sheet rows about an application are deleted along with it.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to see the information we hold about you, to correct it, or to delete it, and you can withdraw
        your application at any time.{' '}
        {CONTACT_EMAIL ? <>Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</> : <>Reply to any email we have sent you.</>}{' '}
        If you are unhappy with how we handle it, you can complain to Sri Lanka’s Data Protection Authority.
      </p>
    </main>
  );
}
