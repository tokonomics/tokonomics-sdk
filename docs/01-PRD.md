# Tokonomics — Product Requirements Document (PRD)
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Status:** APPROVED — Source of truth for MVP scope  

---

## 1. Executive Summary

Tokonomics is an **AI gross margin intelligence platform** for AI SaaS founders. It connects LLM provider spend to individual customers and Stripe revenue, making per-customer AI profitability visible in real time. The core insight driving the product: every AI SaaS company has a monthly LLM invoice, but zero visibility into which specific customers are unprofitable before that invoice arrives.

**North Star Metric:** Number of organizations with at least one "margin leak" identified and acted upon within 30 days of signup.

---

## 2. The Problem (Validated from Landing Page)

| Pain Point | Description | Discovery Delay |
|---|---|---|
| Month-end surprise | Founders discover customer-level losses only when the LLM bill arrives | ~28 days avg |
| Flat pricing, variable costs | Heavy users consume most model budget while paying the same as light users | Ongoing |
| Runaway agent loops | A bad deployment becomes a spend machine with no early warning | Hours–days |
| Vibe-coded stacks | Founders don't know which model their app calls, how often, or why | Always |

**The Missing Layer:** LLM bill shows *what* was spent. Tokonomics shows *who* made you unprofitable.

---

## 3. User Personas

### Persona 1 — The Vibe-Coder Founder (Primary, Free → Starter)
- **Profile:** Solo founder, shipped AI product with Cursor/Replit/Lovable/Claude Code, 10–200 paying customers
- **Technical level:** Low-to-medium. Will not write infra code. Copy-pastes tracking lines.
- **Pain:** No idea what their AI stack costs per customer. Gets surprised by monthly invoices.
- **Goal:** Know which customers are expensive before the invoice lands
- **Key entry point:** "Paste your API key. See your spend in 30 seconds."

### Persona 2 — The Technical AI SaaS Founder (Starter → Growth)
- **Profile:** Hand-codes LLM integrations, 50–500 customers, $5K–$50K MRR
- **Technical level:** High. Uses Python/Node.js SDK, understands token economics
- **Pain:** Can attribute costs manually but it's slow and breaks. Needs automation.
- **Goal:** Real-time per-customer gross margin. Wants to know if pricing model is sustainable.
- **Key entry point:** SDK integration + Stripe connection

### Persona 3 — The Growth-Stage AI Team Lead (Growth → Scale)
- **Profile:** Small team (2–10), AI-first product, $50K+ MRR, investors asking about unit economics
- **Pain:** Needs margin ops as a team, wants investor-ready reports, Slack-based alerting
- **Goal:** Operate margin controls systematically, not reactively
- **Key entry point:** Weekly digest + AI Margin Score + white-label reports

---

## 4. Product Tiers & Feature Scope

### 4.1 Free Tier — "See Your Total AI Spend" ($0/month)
**Target:** Any AI founder. Zero barrier to value.

| # | Feature | Description |
|---|---|---|
| F-01 | Provider API Key Connection | Paste read-only OpenAI / Anthropic / Gemini API key. Encrypted at rest. |
| F-02 | Total AI Spend Dashboard | Daily/weekly/monthly spend charts. Real-time sync from provider. |
| F-03 | Model Mix Breakdown | % of spend and calls per model (gpt-4o, claude-3-5-sonnet, gemini-1.5-pro, etc.) |
| F-04 | Spend Trend & Projections | 7-day rolling trend. Projected monthly spend at current rate. |
| F-05 | Spend Spike Alerts | Email alert when daily spend exceeds N×7-day average. Configurable threshold. |
| F-06 | Read-Only — No code required | Zero SDK, zero deploy. Value in 30 seconds. |

### 4.2 Starter Tier — "See Cost Per Customer" ($99/month)
**Target:** Founders who've shipped and have paying customers.

| # | Feature | Description |
|---|---|---|
| S-01 | SDK — Python Package | `pip install tokonomics`. Decorator + context manager for tracking. |
| S-02 | SDK — Node.js Package | `npm install tokonomics`. Wrapper + middleware for tracking. |
| S-03 | No-Code Prompt Assist | Cursor/Replit/Lovable/Claude Code prompt that adds tracking in one shot. |
| S-04 | Per-Customer Cost Attribution | Every tracked event tagged with `customer_id`, `feature`, `workflow`. |
| S-05 | Customer Cost Table | Sortable table: Customer → Monthly Revenue (manual) → LLM Cost → Margin Status. |
| S-06 | Feature & Workflow Tagging | Tag costs by route/feature/workflow. Drill down on expensive paths. |
| S-07 | Per-Customer Alerts | Alert when a specific customer's spend crosses a configured threshold. |
| S-08 | 90-Day Data History | All events retained for 90 days. |

### 4.3 Growth Tier — "See Real Margin and Fix It Fast" ($199/month)
**Target:** Revenue-backed teams doing real margin ops.

| # | Feature | Description |
|---|---|---|
| G-01 | Stripe Integration | OAuth connect. Pull MRR per customer. Auto-match on email/customer_id. |
| G-02 | AI Gross Margin Dashboard | Revenue − LLM COGS per customer per day. Live numbers. |
| G-03 | Margin Floor Alerts | Alert when customer gross margin drops below configured floor (e.g. 60%). |
| G-04 | Pricing Simulator | Model MRR impact of switching to usage-based pricing or adding fair-use caps. |
| G-05 | Model Routing Suggestions | Shadow-test cheaper models on real traffic. Show cost vs quality comparison. |
| G-06 | AI Margin Score | Composite 0–100 score showing AI unit economics health. Updated daily. |
| G-07 | Weekly Margin Digest | Every Monday: unprofitable customers, changes, recommendations. Email + Slack. |
| G-08 | Slack Notifications | Real-time alert delivery via Slack webhook. |
| G-09 | Unlimited History | All events retained indefinitely. |

### 4.4 Scale Tier — "Run It on Autopilot" ($399/month)
**Target:** Teams doing margin ops at scale.

| # | Feature | Description |
|---|---|---|
| SC-01 | Team Access | Invite teammates. Role-based access: Owner, Admin, Viewer. |
| SC-02 | Benchmark Comparisons | Compare margin score vs anonymized peers in same category. |
| SC-03 | White-Label Investor Reports | PDF reports with org branding for investor updates. |
| SC-04 | Public API Access | REST API to export all data. Documented with OpenAPI. |
| SC-05 | Margin Copilot | AI-drafted fix recommendations based on margin analysis. |
| SC-06 | SLA & DPA | Contractual uptime guarantee and data processing agreement. |

---

## 5. Feature Exclusions (MVP Anti-Scope)

The following are explicitly OUT OF SCOPE for MVP to prevent scope creep:

- ❌ Prompt content capture (privacy-first, never stored)
- ❌ LLM observability / tracing (not Langfuse/Helicone competitor)
- ❌ Infrastructure cost monitoring (not cloud FinOps)
- ❌ Custom model fine-tuning
- ❌ Multi-cloud cost (AWS, GCP, Azure)
- ❌ Mobile app
- ❌ Self-hosted deployment
- ❌ Real-time model quality evaluation (routing suggestions are async, not real-time)

---

## 6. SDK Requirements

### 6.1 SDK Core Contract
The SDK is the primary data ingestion mechanism. It MUST:

1. **Zero prompt capture** — Never send message content, only token counts
2. **One-line integration** — `@track(customer_id=..., feature=...)` decorator pattern
3. **Non-blocking** — Events sent async, never blocks LLM call latency
4. **Auto-detect model** — Reads model from API response, not user config
5. **Automatic token counting** — Reads usage from provider response
6. **Automatic cost calculation** — Server-side, not client-side (prices can change)
7. **Retry with backoff** — If Tokonomics ingestion endpoint is down, queue locally and retry
8. **Supports Python 3.9+ and Node.js 18+**

### 6.2 SDK Supported LLM Providers
- OpenAI (`openai` Python/JS library)
- Anthropic (`anthropic` Python/JS library)
- Google Generative AI (`google-generativeai`)
- LangChain (via callbacks)
- Any HTTP-based LLM (raw event send)

### 6.3 SDK Data Payload (per event)
```json
{
  "customer_id": "string (required)",
  "feature": "string (optional, inferred from route)",
  "workflow": "string (optional)",
  "model": "string (from provider response)",
  "provider": "openai | anthropic | google",
  "input_tokens": "integer",
  "output_tokens": "integer",
  "latency_ms": "integer",
  "timestamp": "ISO 8601 UTC",
  "sdk_version": "string",
  "org_api_key": "string (tok_live_...)"
}
```
**Note:** No prompt text, no completion text, no PII ever sent.

---

## 7. Integrations

| Integration | Purpose | Auth Method |
|---|---|---|
| OpenAI | Spend polling | Read-only API key |
| Anthropic | Spend polling | Read-only API key |
| Google Gemini | Spend polling | Read-only API key |
| Stripe | Revenue data per customer | OAuth Connect |
| Slack | Alert delivery | Webhook URL |
| Email (Resend) | Alerts + weekly digest | Internal (Resend API) |
| GitHub | SDK distribution | Public repo |

---

## 8. Non-Functional Requirements

### 8.1 Performance
| Metric | Target |
|---|---|
| SDK event ingestion latency (p99) | < 200ms |
| Dashboard page load (LCP) | < 2.5s |
| API response time (p95) | < 500ms |
| Provider sync frequency | Every 15 minutes (Free), Every 5 minutes (Paid) |
| Customer aggregate freshness | < 1 minute for Starter+, < 5 min for Growth+ gross margin |

### 8.2 Scale
| Metric | Target |
|---|---|
| Concurrent organizations | 10,000 |
| Events per second (ingestion) | 10,000 RPS at peak |
| Events per org per day | Up to 1M |
| Dashboard query performance | < 1s for 90-day ranges |

### 8.3 Security
- All provider API keys encrypted at rest using AES-256 (KMS-managed key)
- All API keys hashed for lookup (never stored in plaintext)
- TLS 1.3 for all transport
- SDK API keys scoped to org, rotatable
- Stripe OAuth tokens encrypted at rest
- SOC 2 Type II roadmap (post-launch)
- GDPR-compliant data handling

### 8.4 Reliability
- 99.9% uptime SLA (Scale tier)
- Event ingestion queue with dead-letter queue (DLQ) for retry
- Provider sync failures logged and retried with exponential backoff
- DB connection pooling via PgBouncer or Prisma Accelerate

### 8.5 Privacy
- Zero prompt content stored at any time
- Customer IDs hashed in display if org enables privacy mode
- Data retention configurable (90-day free/starter, unlimited growth+)
- Right to deletion honored within 72 hours

---

## 9. Success Metrics

### Launch Metrics (First 90 Days)
| Metric | Target |
|---|---|
| Waitlist conversions to Free | 30% |
| Free → Starter conversion | 15% |
| Starter → Growth conversion | 20% |
| Time to first value (first spend visible) | < 5 minutes |
| SDK integration completion rate | > 60% of Starter signups |

### Product Health Metrics
| Metric | Target |
|---|---|
| Weekly active orgs | > 60% of paying orgs |
| Margin leaks identified per org (30d) | > 1 |
| Alert → action rate | > 30% |
| Churn rate (monthly) | < 5% |
| NPS | > 40 |

---

## 10. Pricing Architecture

```
Free ($0)    → Provider key only → No SDK required
Starter ($99) → SDK required → No Stripe required  
Growth ($199) → SDK + Stripe required → Full margin visibility
Scale ($399)  → Everything + team + API + reports
```

**Billing:** Stripe Billing. Monthly subscription. Annual discount (20%) offered at Growth+.  
**Trial:** Free tier is permanent. Starter/Growth/Scale: 14-day trial with full features.  
**Upgrades:** Prorated. Immediate feature access on upgrade.

---

## 11. Roadmap (Post-MVP)

| Quarter | Feature |
|---|---|
| Q3 2026 | LangChain / LlamaIndex native SDK |
| Q3 2026 | Model routing auto-switch (not just suggest) |
| Q4 2026 | Cost forecasting (30-day projections) |
| Q4 2026 | Multi-provider comparison (same prompt, different models) |
| Q1 2027 | OpenAI-compatible proxy mode (zero-code SDK) |
| Q1 2027 | Marketplace: share routing configs |
