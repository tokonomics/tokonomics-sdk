#!/usr/bin/env bash
# Wire ingest.tokonomics.dev to the Fly.io ingest app.
# Run once after initial deploy. Requires flyctl to be installed and authenticated.
#
# Usage: bash scripts/setup-ingest-domain.sh

set -euo pipefail

INGEST_APP="tokonomics-ingest"   # adjust if your fly app name differs
DOMAIN="ingest.tokonomics.dev"

echo "→ Adding certificate for $DOMAIN to $INGEST_APP..."
flyctl certs add "$DOMAIN" --app "$INGEST_APP"

echo ""
echo "→ Certificate details (copy the CNAME value below):"
flyctl certs show "$DOMAIN" --app "$INGEST_APP"

echo ""
echo "────────────────────────────────────────────────────────"
echo "Next: add this DNS record in Porkbun:"
echo ""
echo "  Type:  CNAME"
echo "  Host:  ingest"
echo "  Value: <copy the 'DNS Validation Record' shown above>"
echo "  TTL:   600"
echo ""
echo "Then wait ~5 minutes for cert provisioning and DNS propagation."
echo "Test with:  curl https://ingest.tokonomics.dev/health"
echo "────────────────────────────────────────────────────────"
