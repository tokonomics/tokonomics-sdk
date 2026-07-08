import Link from "next/link";

export const metadata = { title: "Terms of Service — Tokonomics" };

export default function TermsPage() {
  const updated = "July 8, 2026";
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-900">
      <Link href="/" className="mb-8 inline-block text-sm text-indigo-600 hover:underline">
        ← Back to home
      </Link>
      <h1 className="mb-2 text-3xl font-bold">Terms of Service</h1>
      <p className="mb-10 text-sm text-gray-500">Last updated: {updated}</p>

      <section className="space-y-8 text-sm leading-relaxed text-gray-700">
        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">1. Acceptance</h2>
          <p>
            By accessing or using Tokonomics (&quot;the Service&quot;), you agree to be bound by these Terms.
            If you do not agree, do not use the Service.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">2. Description of service</h2>
          <p>
            Tokonomics is an AI cost intelligence platform that helps AI SaaS companies track LLM
            spend, attribute costs to customers, and calculate gross margins. The Service includes
            a web dashboard, event ingestion API, SDKs, and background analytics processing.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">3. Your responsibilities</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>You are responsible for keeping your SDK keys and API credentials secure.</li>
            <li>You must not use the Service to violate any laws or the terms of your LLM providers.</li>
            <li>You must not attempt to reverse-engineer, overload, or abuse the Service infrastructure.</li>
            <li>You are responsible for ensuring you have appropriate rights to the customer data you send to the Service.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">4. Acceptable use</h2>
          <p>
            The Service is intended for business use by AI SaaS companies. You may not resell or
            sublicense access to the Service without written permission.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">5. Service availability</h2>
          <p>
            We aim for 99.9% uptime but do not guarantee it. We may modify, suspend, or discontinue
            the Service at any time with reasonable notice. Planned maintenance will be announced
            in advance when possible.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">6. Billing</h2>
          <p>
            Paid plans are billed monthly. Cancellation takes effect at the end of the current
            billing period. We do not offer refunds for partial months. We reserve the right to
            change pricing with 30 days notice.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">7. Intellectual property</h2>
          <p>
            Tokonomics retains all rights to the Service software, design, and brand. You retain
            all rights to the data you send to the Service. You grant us a limited license to
            process your data solely to provide the Service.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">8. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Tokonomics is not liable for indirect,
            incidental, or consequential damages. Our total liability for any claim is limited to
            the amount you paid in the 3 months preceding the claim.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">9. Termination</h2>
          <p>
            Either party may terminate at any time. Upon termination, your access is revoked and
            your data is retained for 30 days before deletion, unless you request immediate deletion.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">10. Governing law</h2>
          <p>
            These Terms are governed by the laws of India. Disputes will be resolved by binding
            arbitration in Pune, India.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-gray-900">11. Contact</h2>
          <p>
            Questions?{" "}
            <a href="mailto:legal@tokonomics.dev" className="text-indigo-600 hover:underline">
              legal@tokonomics.dev
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
