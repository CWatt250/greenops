import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy · TLC Management Platform' };

const EFFECTIVE = 'September 5, 2026';

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective {EFFECTIVE}</p>
      <p>
        This policy explains what the TLC Management Platform (the &ldquo;Service&rdquo;), operated by Watt
        Systems, collects about the people who use it, and how that information is used. The company that
        licensed the Service (the &ldquo;Customer&rdquo;) controls the business data inside it; we process that
        data on the Customer&rsquo;s behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email, role, and the company you belong to.</li>
        <li><strong>Work records:</strong> jobs, schedules, notes, photos, customer signatures, invoices, payments, and chemical application logs entered by staff or customers.</li>
        <li><strong>Location:</strong> for crew accounts, GPS position while a job is running, and the position at clock-in and clock-out. Location is only collected when the crew app is open and a shift or job is active. It is used for dispatch, customer ETAs, and payroll verification.</li>
        <li><strong>Device and usage:</strong> browser type, pages visited, and error reports, used to keep the Service working.</li>
      </ul>

      <h2>How it is used</h2>
      <p>
        To run the Customer&rsquo;s operations: scheduling, routing, timesheets, invoicing, customer
        communication, and compliance records. We do not sell personal information, use it for advertising,
        or use it to train machine-learning models.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>Staff of the Customer, according to their role (owners and dispatchers see the office dashboard; crew see their own day; customers see only their own property, invoices, and messages).</li>
        <li>Watt Systems staff, only when needed to provide support or fix a problem.</li>
        <li>Infrastructure providers that host the Service: Supabase (database, authentication, file storage), Vercel (application hosting), Mapbox (maps and geocoding), OpenRouteService (route optimization), OpenWeather (forecasts), and Resend (email delivery). Each receives only what it needs to perform its function.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        Business records are kept for as long as the Customer&rsquo;s subscription is active, and pesticide
        application records for at least seven years as required by Washington State. Crew GPS breadcrumbs
        are pruned after 30 days; clock-in and clock-out positions are kept with the timesheet. On
        termination the Customer may export its data, after which we delete it within 90 days.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Every record is scoped to a company and enforced by
        database-level access rules. Photos and signatures are stored privately and served only to
        authorized users. Passwords are never stored in plain text.
      </p>

      <h2>Your choices</h2>
      <p>
        Portal customers can change their contact details and notification preferences in Settings. Staff
        can change their password in Settings. To correct or delete personal information, or to ask what we
        hold about you, contact the Customer that issued your account or email support@watt-systems.com.
      </p>

      <h2>Contact</h2>
      <p>Watt Systems · support@watt-systems.com</p>
    </article>
  );
}
