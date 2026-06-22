import type { BuyerCandidate, SearchCriteria, TargetProfile } from "./types";

// Exa (exa.ai) neural search — used to discover real strategic acquirers and PE
// firms from the open web, complementing Apollo's structured firmographics.
// Accepts either EXA_API_KEY or SR_EXA_API_KEY.

function key() {
  return process.env.EXA_API_KEY || process.env.SR_EXA_API_KEY || "";
}

export function exaEnabled() {
  return !!key();
}

async function exaSearch(query: string, numResults: number) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key(),
    },
    body: JSON.stringify({
      query,
      type: "auto",
      category: "company",
      numResults,
      contents: { summary: { query } },
    }),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as any[];
}

function nameFromResult(r: any): string {
  if (r.title && r.title.length < 60) return r.title.split(/[|\-–—:]/)[0].trim();
  try {
    const host = new URL(r.url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return r.title ?? "Unknown";
  }
}

/** Discover strategic acquirers and sponsors for a target via Exa. */
export async function sourceBuyersExa(
  profile: TargetProfile,
  criteria: SearchCriteria,
): Promise<BuyerCandidate[]> {
  if (!exaEnabled()) return [];
  const geo = profile.geography ?? "United States";
  try {
    const [strategics, sponsors] = await Promise.all([
      exaSearch(
        `Companies that would acquire a ${profile.industry} business${
          geo ? ` in ${geo}` : ""
        } — ${criteria.keywords.slice(0, 5).join(", ")}`,
        12,
      ),
      exaSearch(
        `Private equity firms investing in ${profile.industry}${
          geo ? ` ${geo}` : ""
        } — ${criteria.sponsorThesis}`,
        8,
      ),
    ]);

    const strat: BuyerCandidate[] = strategics.map((r) => ({
      name: nameFromResult(r),
      type: "strategic" as const,
      industry: profile.industry,
      website: r.url,
      description: (r.summary ?? "").slice(0, 240) || undefined,
      source: "exa",
    }));
    const spon: BuyerCandidate[] = sponsors.map((r) => ({
      name: nameFromResult(r),
      type: "sponsor" as const,
      industry: "Private Equity",
      website: r.url,
      description: (r.summary ?? "").slice(0, 240) || undefined,
      signals: { peBacked: true },
      source: "exa",
    }));
    return [...strat, ...spon];
  } catch {
    return [];
  }
}
