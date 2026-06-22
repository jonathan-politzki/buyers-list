import { deriveSearchCriteria, generateRationales } from "./anthropic";
import { sourceBuyers, sourceContacts } from "./apollo";
import { pushToClay } from "./clay";
import { prisma } from "./db";
import { scoreBuyer } from "./scoring";
import type { BuyerCandidate, TargetProfile } from "./types";

/**
 * Generate a buyers list for a deal:
 *   1. Derive search criteria + buyer thesis (Claude or heuristic)
 *   2. Source strategics + sponsors (Apollo or mock)
 *   3. (optional) push candidates to Clay for waterfall enrichment
 *   4. Score + tier each candidate (rules-based)
 *   5. Write a fit rationale per buyer (Claude or template)
 *   6. Enrich top-tier buyers with contacts
 *   7. Persist buyers + list entries
 *
 * Synchronous for the MVP. Production moves steps 2-6 to a background queue
 * (see README §Build phases).
 */
export async function generateBuyersList(dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("deal not found");

  await prisma.deal.update({
    where: { id: dealId },
    data: { status: "generating" },
  });

  // Clear any prior run so re-generation is idempotent.
  await prisma.listEntry.deleteMany({ where: { dealId } });

  const profile: TargetProfile = {
    codeName: deal.codeName,
    targetName: deal.targetName,
    industry: deal.industry,
    description: deal.description,
    geography: deal.geography,
    revenueBand: deal.revenueBand,
    ebitdaBand: deal.ebitdaBand,
    evBand: deal.evBand,
  };

  // 1. criteria + thesis
  const { criteria, thesis } = await deriveSearchCriteria(profile);

  // 2. source candidates
  const candidates = await sourceBuyers(profile, criteria);

  // 3. optional Clay enrichment (fire-and-forget)
  await pushToClay(deal.codeName, candidates);

  // 4. score + tier
  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreBuyer(profile, criteria, candidate),
  }));
  scored.sort((a, b) => b.score.score - a.score.score);

  // 5. rationales (batched). Persist buyers first to get stable ids.
  const persisted: { id: string; candidate: BuyerCandidate; score: typeof scored[number]["score"] }[] = [];
  for (const s of scored) {
    const buyer = await prisma.buyer.create({
      data: {
        name: s.candidate.name,
        type: s.candidate.type,
        industry: s.candidate.industry,
        size: s.candidate.size,
        location: s.candidate.location,
        website: s.candidate.website,
        description: s.candidate.description,
        signals: s.candidate.signals ? JSON.stringify(s.candidate.signals) : null,
        source: s.candidate.source,
      },
    });
    persisted.push({ id: buyer.id, candidate: s.candidate, score: s.score });
  }

  const rationales = await generateRationales(
    profile,
    persisted.map((p) => ({ id: p.id, candidate: p.candidate })),
  );

  // 6. contacts for top tiers (A and B), then 7. list entries
  for (const p of persisted) {
    if (p.score.tier === "A" || p.score.tier === "B") {
      const contacts = await sourceContacts(p.candidate.name, p.candidate.type);
      for (const c of contacts) {
        await prisma.contact.create({
          data: {
            buyerId: p.id,
            name: c.name,
            title: c.title,
            role: c.role,
            email: c.email,
            phone: c.phone,
          },
        });
      }
    }

    await prisma.listEntry.create({
      data: {
        dealId,
        buyerId: p.id,
        score: p.score.score,
        tier: p.score.tier,
        rationale: rationales[p.id] ?? null,
        dimensions: JSON.stringify(p.score.dimensions),
      },
    });
  }

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      status: "ready",
      buyerThesis: thesis,
      searchCriteria: JSON.stringify(criteria),
    },
  });

  return { count: persisted.length };
}
