// Shared shapes used across the generation pipeline.

export type BuyerType = "strategic" | "sponsor";

export interface TargetProfile {
  codeName: string;
  targetName?: string | null;
  industry: string;
  description: string;
  geography?: string | null;
  revenueBand?: string | null;
  ebitdaBand?: string | null;
  evBand?: string | null;
}

// Search strategy derived from the target profile (by Claude, or heuristically).
export interface SearchCriteria {
  keywords: string[];        // industry / business keywords to match
  industries: string[];      // adjacent industries worth approaching
  employeeMin: number;       // strategics should be large enough to acquire
  geographies: string[];     // preferred buyer geographies
  sponsorThesis: string;     // what kind of PE thesis fits (platform vs add-on)
}

// A candidate surfaced from a data source, before scoring.
export interface BuyerCandidate {
  name: string;
  type: BuyerType;
  industry?: string;
  size?: string;
  location?: string;
  website?: string;
  description?: string;
  signals?: BuyerSignals;
  source: string;
  contacts?: ContactCandidate[];
}

export interface BuyerSignals {
  acquisitionsLast3y?: number;   // strategics: shown M&A appetite
  employees?: number;
  publicCompany?: boolean;
  peBacked?: boolean;
  fundSizeUsdM?: number;         // sponsors: dry powder proxy
  recentFundVintage?: number;    // sponsors: fresh fund => active
  platformInSpace?: boolean;     // sponsors: existing platform => add-on fit
}

export interface ContactCandidate {
  name: string;
  title?: string;
  role?: string;
  email?: string;
  phone?: string;
}

// Output of the rules-based scorer.
export interface ScoreResult {
  score: number; // 0-100
  tier: "A" | "B" | "C";
  dimensions: Record<string, number>;
}

// A fully scored, rationale'd, contact-enriched buyer returned to the client.
export interface GeneratedBuyer {
  id: string;
  name: string;
  type: BuyerType;
  industry?: string;
  size?: string;
  location?: string;
  website?: string;
  description?: string;
  source: string;
  score: number;
  tier: "A" | "B" | "C";
  rationale: string;
  dimensions: Record<string, number>;
  contacts: ContactCandidate[];
}

export interface GeneratedList {
  thesis: string;
  criteria: SearchCriteria;
  buyers: GeneratedBuyer[];
  sources: string[]; // which data sources were live (anthropic, apollo, exa, mock)
}
