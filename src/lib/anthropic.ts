import Anthropic from "@anthropic-ai/sdk";
import type { BuyerCandidate, SearchCriteria, TargetProfile } from "./types";

const MODEL = "claude-opus-4-8";

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

// Ask for JSON and parse it. Prompt-based (not output_config) so it works
// across SDK versions without depending on the structured-output param.
async function structured<T>(
  c: Anthropic,
  system: string,
  user: string,
  shapeHint: string,
  maxTokens = 4000,
): Promise<T> {
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: `${system}\n\nRespond with ONLY valid minified JSON — no markdown, no code fences, no prose. ${shapeHint}`,
    messages: [{ role: "user", content: user }],
  });
  const text = (resp.content as any[]).find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(cleanJson(text)) as T;
}

// Strip code fences / surrounding prose if the model adds them anyway.
function cleanJson(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = Math.min(...["{", "["].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (first !== Infinity && last > first) t = t.slice(first, last + 1);
  return t;
}

/**
 * Derive a buyer search strategy from the target profile.
 * Falls back to a keyword heuristic when no API key is configured.
 */
export async function deriveSearchCriteria(
  profile: TargetProfile,
): Promise<{ criteria: SearchCriteria; thesis: string }> {
  const c = client();
  if (!c) return heuristicCriteria(profile);

  try {
    const shapeHint =
      'Shape: {"thesis":string, "keywords":string[], "industries":string[], "employeeMin":number, "geographies":string[], "sponsorThesis":string}';
    const out = await structured<SearchCriteria & { thesis: string }>(
      c,
      "You are an M&A analyst at a mid-market investment bank building a sell-side buyers list. Be concise and concrete.",
      `Target company being sold:
Industry: ${profile.industry}
Description: ${profile.description}
Geography: ${profile.geography ?? "n/a"}
Revenue band: ${profile.revenueBand ?? "n/a"}
EBITDA band: ${profile.ebitdaBand ?? "n/a"}

Produce: (1) a one-paragraph buyer thesis (who acquires this and why),
(2) search keywords for finding strategic acquirers,
(3) adjacent industries worth approaching,
(4) a minimum employee count a strategic should have to plausibly acquire,
(5) preferred buyer geographies,
(6) the PE/sponsor thesis (platform vs add-on, sector focus).`,
      shapeHint,
    );
    const { thesis, ...criteria } = out;
    return { criteria, thesis };
  } catch (err) {
    console.error("[anthropic criteria error]", (err as any)?.status, (err as Error)?.message);
    return heuristicCriteria(profile);
  }
}

/**
 * Write a one-line fit rationale per buyer. Batched into a single call.
 * Falls back to a template when no API key is configured.
 */
export async function generateRationales(
  profile: TargetProfile,
  buyers: { id: string; candidate: BuyerCandidate }[],
): Promise<Record<string, string>> {
  const c = client();
  if (!c || buyers.length === 0) return templateRationales(profile, buyers);

  try {
    const shapeHint =
      'Shape: {"rationales":[{"id":string,"rationale":string}]} — include every id exactly once.';
    const list = buyers
      .map(
        (b) =>
          `- id=${b.id} | ${b.candidate.name} (${b.candidate.type}) | ${b.candidate.industry ?? ""} | ${b.candidate.description ?? ""}`,
      )
      .join("\n");
    const out = await structured<{ rationales: { id: string; rationale: string }[] }>(
      c,
      "You are an M&A analyst. For each buyer, write ONE crisp sentence on why they fit this target. No fluff.",
      `Target: ${profile.industry} — ${profile.description} (${profile.geography ?? "US"})\n\nBuyers:\n${list}`,
      shapeHint,
      Math.min(8000, 400 + buyers.length * 120),
    );
    const map: Record<string, string> = {};
    for (const r of out.rationales) map[r.id] = r.rationale;
    // Backfill anything the model skipped.
    const fallback = templateRationales(profile, buyers);
    for (const b of buyers) if (!map[b.id]) map[b.id] = fallback[b.id];
    return map;
  } catch {
    return templateRationales(profile, buyers);
  }
}

// ---------------------------------------------------------------------------
// Heuristic fallbacks (no API key required)
// ---------------------------------------------------------------------------

function heuristicCriteria(profile: TargetProfile): {
  criteria: SearchCriteria;
  thesis: string;
} {
  const words = `${profile.industry} ${profile.description}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const keywords = Array.from(new Set(words)).slice(0, 8);
  return {
    thesis: `Likely acquirers are larger ${profile.industry} operators seeking scale, plus PE sponsors with a ${profile.industry} platform pursuing add-ons${
      profile.geography ? ` in ${profile.geography}` : ""
    }.`,
    criteria: {
      keywords: keywords.length ? keywords : [profile.industry.toLowerCase()],
      industries: [profile.industry],
      employeeMin: 200,
      geographies: profile.geography ? [profile.geography] : ["United States"],
      sponsorThesis: `Sector-focused buyout funds with a ${profile.industry} platform for add-on M&A, or generalist funds building a new platform.`,
    },
  };
}

function templateRationales(
  profile: TargetProfile,
  buyers: { id: string; candidate: BuyerCandidate }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const b of buyers) {
    const cand = b.candidate;
    if (cand.type === "strategic") {
      map[b.id] = `${cand.name} operates in ${cand.industry ?? profile.industry} and has the scale${
        cand.signals?.acquisitionsLast3y ? ` and recent M&A activity (${cand.signals.acquisitionsLast3y} deals)` : ""
      } to acquire the target for ${profile.geography ?? "regional"} expansion.`;
    } else {
      map[b.id] = `${cand.name} is a sponsor${
        cand.signals?.platformInSpace ? " with an existing platform in the space (strong add-on fit)" : " whose thesis fits the sector"
      }${cand.signals?.fundSizeUsdM ? `, ~$${cand.signals.fundSizeUsdM}M fund` : ""}.`;
    }
  }
  return map;
}
