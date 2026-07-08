import Link from "next/link";
import { SignInButton, SignUpButton, SignedIn, SignedOut } from "@clerk/nextjs";

export default function LandingPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-6 text-white">
      <div className="max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-sm text-brand-300">
          AI Gross Margin Intelligence
        </div>

        <h1 className="mb-6 text-5xl font-bold tracking-tight">
          Know exactly which customers{" "}
          <span className="text-brand-400">cost you money</span>
        </h1>

        <p className="mb-10 text-xl text-brand-200">
          Connect your OpenAI, Anthropic, or Gemini API key. Track LLM spend per customer.
          See gross margin in minutes.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <SignedOut>
            <SignUpButton>
              <button className="rounded-lg bg-brand-500 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-brand-600">
                Start for free
              </button>
            </SignUpButton>
            <SignInButton>
              <button className="rounded-lg border border-brand-400/40 px-8 py-3 text-lg font-semibold text-brand-200 transition-colors hover:border-brand-300 hover:text-white">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <a
              href="/overview"
              className="rounded-lg bg-brand-500 px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Go to dashboard →
            </a>
          </SignedIn>
        </div>

        <p className="mt-8 text-sm text-brand-400">
          No credit card required · Free tier available · 5-minute setup
        </p>
      </div>

      <footer className="absolute bottom-6 flex gap-6 text-xs text-brand-500">
        <Link href="/privacy" className="hover:text-brand-300">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-brand-300">Terms of Service</Link>
      </footer>
    </main>
  );
}
