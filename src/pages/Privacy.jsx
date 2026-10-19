import { Link } from 'react-router-dom'
import { LegalDocument, LegalSection } from '../components/LegalDocument'
import { COMPANY } from '../data/site'

const UPDATED = '19 October 2026'

const sections = [
  { id: 'who-we-are', title: 'Who we are' },
  { id: 'what-we-collect', title: 'What we collect' },
  { id: 'why', title: 'Why we use it' },
  { id: 'tracking', title: 'Tracking and location' },
  { id: 'sharing', title: 'Who receives it' },
  { id: 'outside-botswana', title: 'Outside Botswana' },
  { id: 'retention', title: 'How long we keep it' },
  { id: 'security', title: 'Security' },
  { id: 'publication', title: 'Recovery stories' },
  { id: 'rights', title: 'Your rights' },
  { id: 'contact', title: 'How to contact us' },
]

export default function Privacy() {
  return (
    <LegalDocument
      eyebrow="Privacy"
      title="Privacy Notice"
      description="How iTreq Inc collects, uses, and protects personal information under the Data Protection Act, 2018."
      updated={UPDATED}
      sections={sections}
    >
      <LegalSection id="who-we-are" title="Who we are">
        <p>
          {COMPANY.name} is the data controller for the personal information described in this
          notice. Our principal place of business is {COMPANY.location}.
        </p>
        <p>
          This notice applies to our website, enquiries, client accounts, invoices and the client
          portal, and to the GPS tracking and recovery service. It also covers employment and pay
          records we keep for our own staff. Those staff records are used only to employ, pay, and
          meet legal duties, and they are not published.
        </p>
        <p>
          We provide this notice so that you know who we are, why we hold your information, and
          how to exercise your rights. It is written for the Data Protection Act, 2018 (Botswana).
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" title="What we collect">
        <p>Depending on how you deal with us, we may hold:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Your name, and an optional record of gender where you provide it.</li>
          <li>
            Your Omang or passport number, where we need to identify you securely for an account,
            a contract, billing, or recovery.
          </li>
          <li>Phone numbers, email address, and postal and physical addresses.</li>
          <li>What you ask us to track, and notes you send with an enquiry.</li>
          <li>
            Account, quotation, invoice, payment, and statement records, including messages about
            those documents.
          </li>
          <li>
            Location and device information from a tracker fitted to a vehicle or other asset:
            position, route history, speed, and alerts. Where a fleet service includes it, trip and
            driver-activity information.
          </li>
          <li>
            A login session stored in your browser so that the client portal or staff tools stay
            signed in, and a preference for how many rows a list shows. We do not use advertising
            cookies or a third-party analytics tag on this website.
          </li>
        </ul>
        <p>
          Fields marked as required on a form must be completed before we can act on the request.
          If you leave them blank, we cannot open the enquiry or the account. Optional fields may
          be left blank.
        </p>
        <p>
          Our services are for adults and for businesses. We do not knowingly collect personal
          information from children.
        </p>
      </LegalSection>

      <LegalSection id="why" title="Why we use it">
        <p>We use personal information only for stated purposes:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            To respond to an enquiry and take steps you have asked for before a contract, including
            preparing a quotation.
          </li>
          <li>
            To perform a contract: supply and install tracking, operate the service, bill you, and
            support recovery of a tracked asset.
          </li>
          <li>
            To meet a legal duty, including tax and accounting records, and a request from a
            competent authority where the law requires us to respond.
          </li>
          <li>
            Where you have agreed in writing, including when you confirm that you have read this
            notice before sending an enquiry.
          </li>
        </ul>
        <p>
          We process an identity-card or passport number because secure identification matters for
          the account, the contract, and recovery. We do not use it for any other purpose.
        </p>
        <p>
          We do not sell personal information. We do not send promotional messages that are
          unrelated to an enquiry you made or to a service you have with us. You may object, in
          writing, to any direct marketing.
        </p>
      </LegalSection>

      <LegalSection id="tracking" title="Tracking and location">
        <p>
          A tracker fitted to a vehicle or asset produces location information. That information
          can identify the client and, in some cases, a driver or another person using the asset.
          We use it to provide the monitoring you asked for, to alert you, and to help locate the
          asset if it goes missing.
        </p>
        <p>
          Where the device supports it, and where you have asked for it, the service may include
          remote engine switch-off. The conditions for that feature are set out in our{' '}
          <Link to="/terms" className="text-brand-300 hover:text-brand-200">
            Terms of Service
          </Link>
          . We may refuse a request that would be unsafe or unlawful.
        </p>
        <p>
          Signal, map, and history depend on the device, the network, and the installation. A gap
          in location history is not, by itself, a decision about you.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="Who receives it">
        <p>We share personal information only as far as the service or the law requires:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Staff at iTreq Inc who need it to do their job.</li>
          <li>
            The companies that host our website and our client database, and the providers that
            send email or SMS for invoices, reminders, and sign-in codes. They process that
            information for us and on our instructions.
          </li>
          <li>
            The tracking platform and device suppliers we use to deliver monitoring, where they
            must handle location or device data to provide the service.
          </li>
          <li>Your bank, or ours, when a payment is made or reconciled.</li>
          <li>
            Law enforcement or another competent authority when you ask us to assist a recovery, or
            when the law requires disclosure.
          </li>
        </ul>
        <p>
          If you write to us on WhatsApp, or visit our Facebook page, those services process that
          communication under their own terms. We receive what you choose to send us.
        </p>
      </LegalSection>

      <LegalSection id="outside-botswana" title="Outside Botswana">
        <p>
          iTreq Inc is in Botswana. The website is hosted, and client and enquiry records are
          stored, on systems operated outside Botswana. Email and SMS may also pass through
          providers outside Botswana.
        </p>
        <p>
          The Data Protection Act restricts transfers out of Botswana. A transfer may be made
          where it is necessary to perform our contract with you, or to take the steps you asked
          for before a contract, such as storing an enquiry and sending a quotation. We require
          those providers to protect the information and to use it only for that work. Where the
          Act requires the Commissioner’s authorisation or another safeguard as well, we will put
          that in place before relying on it.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <p>
          We keep personal information only for as long as the purpose requires, and then we delete
          it or reduce it so that it no longer identifies you, unless a law requires us to keep it.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            An enquiry is kept while we are dealing with it, and for a limited period afterwards in
            case you continue the conversation or we must show what was requested.
          </li>
          <li>
            Account, installation, and location records are kept for the life of the service and
            for a reasonable period after it ends, so that we can answer a query, support a
            recovery, or deal with a claim.
          </li>
          <li>
            Invoices, payments, and other financial records are kept for the period Botswana tax
            law requires.
          </li>
          <li>Staff pay records are kept for the period employment and tax law require.</li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          We take technical and organisational measures suited to the information we hold,
          including access limited to staff who need it, sign-in controls on the portal, and
          hosting arrangements intended to prevent unauthorised access, loss, or alteration.
        </p>
        <p>
          If a breach of those safeguards affects your personal information, we will notify the
          Information and Data Protection Commission without delay, as the Act requires, and we
          will tell you where that is the right way to reduce the harm.
        </p>
      </LegalSection>

      <LegalSection id="publication" title="Recovery stories">
        <p>
          When we publish a recovery on this website, faces, registration plates, and other
          details that would identify a person are blurred or removed first. We do not publish a
          client’s name, Omang or passport number, or contact details in a success story.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your rights">
        <p>Under the Data Protection Act, 2018, you may ask us to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Confirm whether we hold personal information about you.</li>
          <li>Provide you with a copy of that information within a reasonable time.</li>
          <li>Correct, complete, or delete information that is inaccurate or that should not be kept.</li>
          <li>Give you a reason if we refuse a request, so that you can challenge the refusal.</li>
          <li>Stop using your information for direct marketing.</li>
          <li>
            Accept a written withdrawal of consent, where we rely on consent and you have a
            legitimate, reasonable, and compelling ground to withdraw it. Withdrawal does not undo
            processing that was already lawful, and it does not end a record we must keep for a
            contract or a legal duty.
          </li>
        </ul>
        <p>
          We may ask you to prove your identity before we act, so that we do not disclose your
          information to someone else. A next of kin may complain on your behalf where you cannot
          do so yourself.
        </p>
        <p>
          You may also lodge a complaint with the Information and Data Protection Commission if you
          believe we have not complied with the Act. Use the contact details the Commission
          publishes for that purpose.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="How to contact us">
        <p>
          Write to {COMPANY.name}, {COMPANY.location}, or email{' '}
          <a href={`mailto:${COMPANY.email}`} className="text-brand-300 hover:text-brand-200">
            {COMPANY.email}
          </a>
          . You may also call {COMPANY.phone} during {COMPANY.hours}.
        </p>
        <p>
          Please mark the message “Personal data request” and say what you want us to do. We keep
          a record of the request and of our reply.
        </p>
        <p>
          The contract for the tracking service is in our{' '}
          <Link to="/terms" className="text-brand-300 hover:text-brand-200">
            Terms of Service
          </Link>
          . We will change the date at the top of this notice when we update it.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
