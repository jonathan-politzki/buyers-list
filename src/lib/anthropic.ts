import Anthropic from "@anthropic-ai/sdk";
import type { BuyerCandidate, SearchCriteria, TargetProfile } from "./types";

const MODEL = "claude-opus-4-8";

function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

// Run a structured-output request and parse the JSON the model returns.
async function structured<T>(
  c: Anthropic,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  maxTokens = 4000,
): Promise<T> {
  // output_config is cast through `any` to stay compatible across SDK minor
  // versions; the wire shape is stable.
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  } as any);
  const text = (resp.content as any[]).find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text) as T;
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
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["thesis", "keywords", "industries", "employeeMin", "geographies", "sponsorThesis"],
      properties: {
        thesis: { type: "string" },
        keywords: { type: "array", items: { type: "string" } },
        industries: { type: "array", items: { type: "string" } },
        employeeMin: { type: "integer" },
        geographies: { type: "array", items: { type: "string" } },
        sponsorThesis: { type: "string" },
      },
    };
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
      schema,
    );
    const { thesis, ...criteria } = out;
    return { criteria, thesis };
  } catch {
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
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["rationales"],
      properties: {
        rationales: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "rationale"],
            properties: {
              id: { type: "string" },
              rationale: { type: "string" },
            },
          },
        },
      },
    };
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
      schema,
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
