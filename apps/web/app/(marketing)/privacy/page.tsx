import Link from "next/link";

export const metadata = { title: "Privacy Policy — Tokonomics" };

export default function PrivacyPage() {
  const updated = "July 8, 2026";
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-900">
      <Link href="/" className="mb-8 inline-block text-sm text-indigo-600 hover:underline">
        ← Back to home
      </Link>
      <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-10 text-sm text-gray-500">Last updated: {updated}</p>

      <section className="space-y-8 text-sm leading-relaxed text-gray-700">
        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">1. What we collect</h2>
          <p>
            Tokonomics collects the minimum information necessary to provide the service:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your email address and name (via Clerk authentication)</li>
            <li>API keys you provide (encrypted at rest with AES-256-GCM; last four digits stored in plaintext for display)</li>
            <li>LLM usage metadata: token counts, model names, request latencies, and customer identifiers you send via the SDK</li>
            <li>Billing information processed by our payment provider (we never see raw card numbers)</li>
          </ul>
          <p className="mt-2 font-medium">
            We never capture or store the content of your prompts or LLM responses.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">2. How we use your data</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>To calculate and display AI spend, gross margins, and cost attribution</li>
            <li>To send alert emails and weekly digest emails you have opted into</li>
            <li>To improve the product (aggregated, anonymized analytics via PostHog)</li>
            <li>To detect errors and incidents (Sentry error tracking)</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">3. Data retention</h2>
          <p>
            Raw usage events are retained for 12 months. Daily aggregates are retained indefinitely
            unless you delete your account. You can request deletion of all your data at any time
            by emailing <a href="mailto:privacy@tokonomics.dev" className="text-indigo-600 hover:underline">privacy@tokonomics.dev</a>.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">4. Third-party services</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Clerk</strong> — authentication and user management</li>
            <li><strong>Supabase</strong> — PostgreSQL database hosting</li>
            <li><strong>Upstash</strong> — Redis caching</li>
            <li><strong>Fly.io</strong> — event ingestion and background worker hosting</li>
            <li><strong>Vercel</strong> — web application hosting</li>
            <li><strong>Resend</strong> — transactional email delivery</li>
            <li><strong>Sentry</strong> — error monitoring</li>
            <li><strong>PostHog</strong> — product analytics (anonymized)</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">5. Your rights</h2>
          <p>
            You may access, correct, or delete your personal data at any time. To exercise your
            rights, contact us at{" "}
            <a href="mailto:privacy@tokonomics.dev" className="text-indigo-600 hover:underline">
              privacy@tokonomics.dev
            </a>
            . We will respond within 30 days.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">6. Security</h2>
          <p>
            All data is encrypted in transit (TLS 1.2+) and at rest. API keys are encrypted using
            AES-256-GCM with a rotating encryption key. We conduct regular security reviews and
            follow OWASP guidelines.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">7. Contact</h2>
          <p>
            Questions about this policy?{" "}
            <a href="mailto:privacy@tokonomics.dev" className="text-indigo-600 hover:underline">
              privacy@tokonomics.dev
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
