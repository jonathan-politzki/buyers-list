import { deriveSearchCriteria, generateRationales } from "./anthropic";
import { sourceBuyers, sourceContacts } from "./apollo";
import { sourceBuyersExa } from "./exa";
import { pushToClay } from "./clay";
import { scoreBuyer } from "./scoring";
import type {
  BuyerCandidate,
  GeneratedBuyer,
  GeneratedList,
  TargetProfile,
} from "./types";

// Merge candidates from multiple sources, deduping by normalized name.
function dedupe(...lists: BuyerCandidate[][]): BuyerCandidate[] {
  const seen = new Map<string, BuyerCandidate>();
  for (const list of lists) {
    for (const c of list) {
      const key = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, c);
    }
  }
  return Array.from(seen.values());
}

/**
 * Generate a buyers list for a target profile — fully in-memory, no database.
 *   1. Derive search criteria + buyer thesis (Claude or heuristic)
 *   2. Source strategics + sponsors (Apollo + Exa, or mock), deduped
 *   3. (optional) push candidates to Clay for waterfall enrichment
 *   4. Score + tier each candidate (rules-based)
 *   5. Write a fit rationale per buyer (Claude or template)
 *   6. Enrich top-tier buyers with contacts
 * Returns the complete list as JSON for the client to hold/curate.
 */
export async function runPipeline(profile: TargetProfile): Promise<GeneratedList> {
  // 1. criteria + thesis
  const { criteria, thesis } = await deriveSearchCriteria(profile);

  // 2. source candidates (Apollo/mock + Exa), deduped
  const [apolloCands, exaCands] = await Promise.all([
    sourceBuyers(profile, criteria),
    sourceBuyersExa(profile, criteria),
  ]);
  const candidates = dedupe(exaCands, apolloCands);

  // 3. optional Clay enrichment (fire-and-forget)
  await pushToClay(profile.codeName, candidates);

  // 4. score + tier, then sort
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreBuyer(profile, criteria, candidate) }))
    .sort((a, b) => b.score.score - a.score.score)
    .map((s, i) => ({ ...s, id: `b${i}_${slug(s.candidate.name)}` }));

  // 5. rationales (batched)
  const rationales = await generateRationales(
    profile,
    scored.map((s) => ({ id: s.id, candidate: s.candidate })),
  );

  // 6. contacts for top tiers (A and B), in parallel
  const buyers: GeneratedBuyer[] = await Promise.all(
    scored.map(async (s) => {
      const contacts =
        s.score.tier === "A" || s.score.tier === "B"
          ? await sourceContacts(s.candidate.name, s.candidate.type)
          : [];
      return {
        id: s.id,
        name: s.candidate.name,
        type: s.candidate.type,
        industry: s.candidate.industry,
        size: s.candidate.size,
        location: s.candidate.location,
        website: s.candidate.website,
        description: s.candidate.description,
        source: s.candidate.source,
        score: s.score.score,
        tier: s.score.tier,
        rationale: rationales[s.id] ?? "",
        dimensions: s.score.dimensions,
        contacts,
      };
    }),
  );

  const sources = Array.from(new Set(buyers.map((b) => b.source)));
  if (process.env.ANTHROPIC_API_KEY) sources.push("anthropic");

  return { thesis, criteria, buyers, sources };
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24);
}
