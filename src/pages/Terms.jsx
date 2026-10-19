import { Link } from 'react-router-dom'
import { LegalDocument, LegalSection } from '../components/LegalDocument'
import { COMPANY } from '../data/site'

const UPDATED = '19 October 2026'

const sections = [
  { id: 'agreement', title: 'This agreement' },
  { id: 'website', title: 'The website' },
  { id: 'quotations', title: 'Quotations' },
  { id: 'service', title: 'The tracking service' },
  { id: 'your-duties', title: 'Your duties' },
  { id: 'switch-off', title: 'Remote switch-off' },
  { id: 'recovery', title: 'Recovery support' },
  { id: 'fees', title: 'Fees and payment' },
  { id: 'liability', title: 'Liability' },
  { id: 'ending', title: 'Ending the service' },
  { id: 'law', title: 'Law and contact' },
]

export default function Terms() {
  return (
    <LegalDocument
      eyebrow="Terms"
      title="Terms of Service"
      description="The terms on which iTreq Inc provides this website and its GPS tracking and recovery service."
      updated={UPDATED}
      sections={sections}
    >
      <LegalSection id="agreement" title="This agreement">
        <p>
          These terms are between you and {COMPANY.name}, {COMPANY.location}. They apply to your
          use of this website and, when you accept a quotation or we activate a service, to the
          supply, installation, monitoring, and recovery support we provide.
        </p>
        <p>
          If you accept on behalf of a company or another person, you confirm that you have
          authority to bind them. “You” includes that company or person.
        </p>
        <p>
          Our{' '}
          <Link to="/privacy" className="text-brand-300 hover:text-brand-200">
            Privacy Notice
          </Link>{' '}
          explains how we handle personal information. It forms part of the way we provide the
          service. It does not replace these terms.
        </p>
      </LegalSection>

      <LegalSection id="website" title="The website">
        <p>
          The public pages describe our services in general. A description on the website is not
          a quotation and not a promise that a particular device, feature, or coverage is
          available for your asset until we confirm it in writing.
        </p>
        <p>
          You may not misuse the website or the client portal: do not attempt to access another
          person’s account, interfere with the service, or submit information you know is false.
        </p>
        <p>
          The site design, text, and marks are owned by {COMPANY.name} or used with permission.
          You may read and print a page for your own use. You may not copy the site for a
          competing service.
        </p>
      </LegalSection>

      <LegalSection id="quotations" title="Quotations">
        <p>
          A quotation sets out the items, the price in Botswana Pula, and any commercial terms
          printed on that document, including how long the quotation remains valid. Those
          commercial terms govern that order. These Terms of Service govern the ongoing service
          once the order is accepted.
        </p>
        <p>
          Accepting a quotation is an order for the items and services listed. Supply,
          installation, and activation dates are confirmed after acceptance. A quotation is not a
          VAT invoice. A tax invoice is issued when payment is due.
        </p>
        <p>
          If a printed quotation term and these terms both speak to the same commercial point,
          the quotation prevails for that order. These terms prevail for monitoring, acceptable
          use, remote switch-off, recovery support, and liability.
        </p>
      </LegalSection>

      <LegalSection id="service" title="The tracking service">
        <p>
          The service is the fitting and operation of a tracking device, access to the location
          and alerts we agree, and recovery support for an asset that is on service. The exact
          device, what it reports, and whether features such as route history or remote engine
          switch-off are included, are those stated in your quotation or service record.
        </p>
        <p>
          Coverage depends on the device, how and where it is installed, the mobile network, and
          power to the unit. We do not promise uninterrupted tracking, a position fix in every
          location, or a particular response time. Cross-border monitoring is available only where
          we have confirmed that the device and network support it.
        </p>
        <p>
          Unless the quotation says otherwise, the device remains our equipment or is supplied on
          the terms printed on the quotation. You must not remove, transfer, or tamper with a
          device except with our agreement or when the service has ended and we have asked you to
          return it.
        </p>
      </LegalSection>

      <LegalSection id="your-duties" title="Your duties">
        <p>You agree that:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You are the owner of the asset, or you have the owner’s authority to have it tracked
            and, where applicable, to request remote engine switch-off.
          </li>
          <li>
            The information you give us, including identity and contact details, is accurate, and
            you will tell us when it changes.
          </li>
          <li>
            You will use the service only for a lawful purpose. You will not use location
            information to harass, threaten, or unlawfully monitor a person.
          </li>
          <li>
            You will keep portal sign-in details confidential and tell us promptly if you believe
            someone else has used your account.
          </li>
          <li>
            You will give our installer safe access to the asset at the agreed time, and you will
            tell us about modifications that could affect the device.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="switch-off" title="Remote switch-off">
        <p>
          Remote engine switch-off is available only where the installed device supports it and
          your service includes it. A command is sent only at the request of the account holder,
          or of a person the account holder has authorised, or where we must act to meet a legal
          duty.
        </p>
        <p>
          You must not request switch-off where it would endanger the driver, a passenger, or
          another road user. In particular, you must not ask us to disable a vehicle that is
          moving in traffic. We may refuse any request that appears unsafe or unlawful, and we
          may ask you to confirm your authority before we act.
        </p>
        <p>
          A switch-off command can fail because of network coverage, device power, installation,
          or the state of the vehicle. Failure of a command is not a breach of these terms.
        </p>
      </LegalSection>

      <LegalSection id="recovery" title="Recovery support">
        <p>
          If a tracked asset goes missing, we will use the last available location and reasonable
          efforts to help you and, where you ask us to, the relevant authorities. We do not
          guarantee that the asset will be found, recovered, or returned in any particular
          condition.
        </p>
        <p>
          We do not replace the police. You remain responsible for reporting a crime. We
          coordinate from the tracking information we hold. We do not insure the asset. Any
          insurance claim is between you and your insurer.
        </p>
        <p>
          Photographs of a recovery are published only after faces, registration plates, and other
          identifying details have been removed or blurred, as described in the Privacy Notice.
        </p>
      </LegalSection>

      <LegalSection id="fees" title="Fees and payment">
        <p>
          Prices are in Botswana Pula. VAT is charged where the law requires it and is shown on
          the invoice. Installation, hardware, and recurring monitoring fees are those in the
          accepted quotation or a later written change you accept.
        </p>
        <p>
          Invoices are due on the date stated on the invoice. If an invoice is unpaid, we may
          suspend monitoring and portal access after notice to the email or phone number we hold
          for you. Suspension does not erase fees already incurred. We may also recover the
          device.
        </p>
        <p>
          A payment record in the portal reflects what we have allocated. It is not, by itself, a
          bank confirmation. If you notify us of a payment, we confirm it against our account
          before we treat the invoice as paid.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Liability">
        <p>
          We provide the service with reasonable care and skill. We are not liable for loss that
          arises from network failure, a device fault we could not reasonably have prevented, an
          incorrect instruction from you, or information you gave us that was incomplete or wrong.
        </p>
        <p>
          We are not liable for loss of profit, loss of business, or other indirect or
          consequential loss arising from the service or the website. Nothing in these terms
          limits liability for death or personal injury caused by our negligence, for fraud, or
          for any other liability that the law of Botswana does not allow us to exclude.
        </p>
        <p>
          You are responsible for how you use location information and for any switch-off request
          you make. You will meet any claim brought against us by a third party because you lacked
          authority, or because you asked us to do something unsafe or unlawful, except to the
          extent the claim was caused by our own negligence or wilful misconduct.
        </p>
      </LegalSection>

      <LegalSection id="ending" title="Ending the service">
        <p>
          You may end a monitoring service by written notice to us. We may end it by written
          notice if you are in material breach, including non-payment after notice, misuse of the
          service, or loss of authority over the asset, and you do not put that right within a
          reasonable time.
        </p>
        <p>
          When the service ends, monitoring stops, portal access to that service may close, and
          you will return our equipment if we ask you to. Fees for the period already supplied
          remain payable. Clauses that by their nature should continue, including privacy,
          liability, and governing law, continue after the service ends.
        </p>
      </LegalSection>

      <LegalSection id="law" title="Law and contact">
        <p>
          These terms are governed by the law of Botswana. The courts of Botswana have
          jurisdiction. We will first try to resolve a dispute with you directly.
        </p>
        <p>
          We may update these terms. The date at the top will change when we do. The terms in
          force when you accepted a quotation continue to govern that order’s commercial terms.
          Continued use of an ongoing monitoring service after we have notified you of a change is
          acceptance of the updated terms for the period after the change.
        </p>
        <p>
          {COMPANY.name}, {COMPANY.location}. Email{' '}
          <a href={`mailto:${COMPANY.email}`} className="text-brand-300 hover:text-brand-200">
            {COMPANY.email}
          </a>
          . Phone {COMPANY.phone}. {COMPANY.hours}.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
