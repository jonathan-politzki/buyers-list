import type { BuyerCandidate } from "./types";

/**
 * Clay integration (optional). Clay is great as the enrichment/orchestration
 * layer: push candidate buyers to a Clay table via an inbound webhook, let Clay
 * run waterfall enrichment (firmographics, contacts, signals across providers),
 * and read results back.
 *
 * For the MVP we support the push direction (fire-and-forget webhook). Pulling
 * enriched rows back is a follow-up once a Clay table is wired up — see README.
 *
 * No-ops when CLAY_WEBHOOK_URL is not configured.
 */
export async function pushToClay(
  dealCode: string,
  candidates: BuyerCandidate[],
): Promise<{ pushed: number }> {
  const url = process.env.CLAY_WEBHOOK_URL;
  if (!url) return { pushed: 0 };

  let pushed = 0;
  for (const c of candidates) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal: dealCode,
          name: c.name,
          type: c.type,
          industry: c.industry,
          website: c.website,
          location: c.location,
        }),
      });
      pushed++;
    } catch {
      // best-effort; Clay enrichment is non-blocking for list generation
    }
  }
  return { pushed };
}

export function clayEnabled() {
  return !!process.env.CLAY_WEBHOOK_URL;
}
