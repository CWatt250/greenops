import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service · TLC Management Platform' };

const EFFECTIVE = 'September 5, 2026';

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Effective {EFFECTIVE}</p>
      <p>
        These terms govern use of the TLC Management Platform (the &ldquo;Service&rdquo;), a field-service
        operations application provided by Watt Systems (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By signing in you
        agree to them on behalf of yourself and, if you are staff, the company that licensed the Service
        (the &ldquo;Customer&rdquo;).
      </p>

      <h2>1. The license</h2>
      <p>
        We grant the Customer a non-exclusive, non-transferable right to use the Service for its own
        business operations during the subscription term. Staff, crew, and portal accounts are created by
        the Customer and may be used only by the person they were issued to. The Customer is responsible
        for keeping credentials confidential and for activity under its accounts.
      </p>

      <h2>2. Your data</h2>
      <p>
        Everything the Customer and its staff or customers enter into the Service (clients, jobs, photos,
        signatures, invoices, payments, timesheets, chemical application records, messages) is the
        Customer&rsquo;s data. We do not sell it, use it to train models, or share it with third parties
        except the infrastructure providers needed to run the Service. The Customer may export its data at
        any time, and may request a complete export within 30 days of termination.
      </p>

      <h2>3. Availability, backups, and support</h2>
      <p>
        We aim to keep the Service available around the clock and will give notice of planned maintenance
        where practical. Production data is backed up daily by our database provider. Support is by email
        at support@watt-systems.com during business hours (Pacific time); urgent issues that stop crews from
        working are treated first.
      </p>

      <h2>4. Records you are required to keep</h2>
      <p>
        Some records held in the Service, such as pesticide application logs, are ones the Customer is
        legally required to retain. We keep them for as long as the subscription is active and for at least
        seven years after they are created, unless the Customer asks us to delete them in writing.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not attempt to access another company&rsquo;s data or another user&rsquo;s account.</li>
        <li>Do not use the Service to send unlawful or unsolicited communications.</li>
        <li>Do not probe, scan, or overload the Service or its providers.</li>
      </ul>

      <h2>6. Fees and term</h2>
      <p>
        Fees, the subscription term, and renewal are set out in the Customer&rsquo;s order or license
        agreement. If a fee is not paid within 30 days of its due date we may suspend access after written
        notice. Either party may end the agreement at the end of the current term with 30 days&rsquo; notice.
      </p>

      <h2>7. Warranty and liability</h2>
      <p>
        The Service is provided as-is. We do not warrant that it will be error-free or that estimates,
        route timings, or weather suggestions are accurate; the Customer remains responsible for its own
        business decisions. To the extent permitted by law, our total liability for any claim relating to
        the Service is limited to the fees the Customer paid in the twelve months before the claim, and
        neither party is liable for indirect or consequential loss.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these terms from time to time. Material changes will be announced in the app or by
        email at least 14 days before they take effect. Continued use after that date is acceptance.
      </p>

      <h2>9. Contact</h2>
      <p>Watt Systems · support@watt-systems.com</p>
    </article>
  );
}
