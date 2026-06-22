import type {
  BuyerCandidate,
  ScoreResult,
  SearchCriteria,
  TargetProfile,
} from "./types";

/**
 * Rules-based fit scoring. Deterministic and inspectable — analysts can see
 * exactly why a buyer ranked where it did. Claude adds the narrative rationale
 * on top; it does not set the score.
 *
 * Dimensions (max 100):
 *   industryFit   30  — sector/keyword overlap
 *   sizeFit       25  — strategic large enough to acquire / sponsor check-size fit
 *   maAppetite    20  — shown acquisition activity / dry powder / platform fit
 *   geoFit        15  — geographic overlap
 *   typeBaseline  10  — base credit by buyer type
 */
export function scoreBuyer(
  profile: TargetProfile,
  criteria: SearchCriteria,
  buyer: BuyerCandidate,
): ScoreResult {
  const industryFit = scoreIndustryFit(profile, criteria, buyer);
  const sizeFit = scoreSizeFit(criteria, buyer);
  const maAppetite = scoreMaAppetite(buyer);
  const geoFit = scoreGeoFit(criteria, buyer);
  const typeBaseline = buyer.type === "strategic" ? 8 : 7;

  const dimensions = { industryFit, sizeFit, maAppetite, geoFit, typeBaseline };
  const score = Math.round(
    Math.min(100, industryFit + sizeFit + maAppetite + geoFit + typeBaseline),
  );
  const tier: ScoreResult["tier"] = score >= 75 ? "A" : score >= 55 ? "B" : "C";
  return { score, tier, dimensions };
}

function tokens(s?: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function scoreIndustryFit(
  profile: TargetProfile,
  criteria: SearchCriteria,
  buyer: BuyerCandidate,
): number {
  const target = new Set([
    ...tokens(profile.industry),
    ...criteria.keywords.map((k) => k.toLowerCase()),
  ]);
  const hay = tokens(`${buyer.industry} ${buyer.description}`);
  if (target.size === 0) return 15;
  let hits = 0;
  for (const t of hay) if (target.has(t)) hits++;
  const ratio = Math.min(1, hits / Math.min(target.size, 4));
  return Math.round(ratio * 30);
}

function scoreSizeFit(criteria: SearchCriteria, buyer: BuyerCandidate): number {
  if (buyer.type === "strategic") {
    const emp = buyer.signals?.employees ?? 0;
    if (emp >= criteria.employeeMin * 3) return 25;
    if (emp >= criteria.employeeMin) return 18;
    if (emp > 0) return 8;
    return 12; // unknown — neutral-ish
  }
  // sponsor: a fund needs enough capital to write the check, not so large the
  // deal is immaterial.
  const fund = buyer.signals?.fundSizeUsdM ?? 0;
  if (fund >= 200 && fund <= 1500) return 25;
  if (fund > 0) return 16;
  return 12;
}

function scoreMaAppetite(buyer: BuyerCandidate): number {
  if (buyer.type === "strategic") {
    const deals = buyer.signals?.acquisitionsLast3y ?? 0;
    if (deals >= 4) return 20;
    if (deals >= 2) return 15;
    if (deals >= 1) return 10;
    return 4;
  }
  let s = 0;
  if (buyer.signals?.platformInSpace) s += 12; // add-on thesis is the strongest signal
  const vintage = buyer.signals?.recentFundVintage ?? 0;
  if (vintage >= 2023) s += 8; // fresh fund => actively deploying
  else if (vintage > 0) s += 4;
  return Math.min(20, s);
}

function scoreGeoFit(criteria: SearchCriteria, buyer: BuyerCandidate): number {
  const geos = criteria.geographies.map((g) => g.toLowerCase());
  const loc = (buyer.location ?? "").toLowerCase();
  if (!loc) return 7;
  for (const g of geos) {
    const region = g.split(",")[0].trim();
    if (region && loc.includes(region)) return 15;
  }
  if (loc.includes("united states") || loc.includes("usa")) return 9;
  return 5;
}
