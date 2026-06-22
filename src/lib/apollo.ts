import type {
  BuyerCandidate,
  ContactCandidate,
  SearchCriteria,
  TargetProfile,
} from "./types";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function hasKey() {
  return !!process.env.APOLLO_API_KEY;
}

async function apollo(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": process.env.APOLLO_API_KEY as string,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apollo ${path} ${res.status}`);
  return res.json();
}

/**
 * Source strategic acquirers and financial sponsors for a target.
 * Uses Apollo when APOLLO_API_KEY is set; otherwise returns mock candidates so
 * the full pipeline is demoable without credentials.
 */
export async function sourceBuyers(
  profile: TargetProfile,
  criteria: SearchCriteria,
): Promise<BuyerCandidate[]> {
  if (!hasKey()) return mockBuyers(profile, criteria);
  try {
    const strategics = await sourceStrategics(criteria);
    const sponsors = await sourceSponsors(criteria);
    const all = [...strategics, ...sponsors];
    return all.length ? all : mockBuyers(profile, criteria);
  } catch {
    return mockBuyers(profile, criteria);
  }
}

async function sourceStrategics(criteria: SearchCriteria): Promise<BuyerCandidate[]> {
  const data = await apollo("/mixed_companies/search", {
    q_organization_keyword_tags: criteria.keywords.slice(0, 5),
    organization_num_employees_ranges: [`${criteria.employeeMin},1000000`],
    page: 1,
    per_page: 15,
  });
  const orgs: any[] = data.organizations ?? data.accounts ?? [];
  return orgs.map((o) => ({
    name: o.name,
    type: "strategic" as const,
    industry: o.industry,
    size: o.estimated_num_employees ? `${o.estimated_num_employees} employees` : undefined,
    location: [o.city, o.state, o.country].filter(Boolean).join(", ") || undefined,
    website: o.website_url,
    description: o.short_description,
    signals: {
      employees: o.estimated_num_employees,
      publicCompany: o.publicly_traded_symbol ? true : false,
    },
    source: "apollo",
  }));
}

async function sourceSponsors(criteria: SearchCriteria): Promise<BuyerCandidate[]> {
  // PE firms surface in Apollo under the "private equity" / "venture capital"
  // industry plus the sector keyword.
  const data = await apollo("/mixed_companies/search", {
    q_organization_keyword_tags: [...criteria.keywords.slice(0, 3), "private equity"],
    page: 1,
    per_page: 10,
  });
  const orgs: any[] = data.organizations ?? data.accounts ?? [];
  return orgs
    .filter((o) => /private equity|capital|partners|holdings/i.test(o.name ?? ""))
    .map((o) => ({
      name: o.name,
      type: "sponsor" as const,
      industry: o.industry,
      location: [o.city, o.state, o.country].filter(Boolean).join(", ") || undefined,
      website: o.website_url,
      description: o.short_description,
      signals: { peBacked: true },
      source: "apollo",
    }));
}

/** Enrich a buyer with decision-maker contacts (Apollo people search). */
export async function sourceContacts(
  buyerName: string,
  type: BuyerCandidate["type"],
): Promise<ContactCandidate[]> {
  if (!hasKey()) return mockContacts(type);
  try {
    const titles =
      type === "strategic"
        ? ["Head of Corporate Development", "VP Corporate Development", "Director M&A"]
        : ["Partner", "Managing Director", "Principal"];
    const data = await apollo("/mixed_people/search", {
      q_organization_name: buyerName,
      person_titles: titles,
      page: 1,
      per_page: 3,
    });
    const people: any[] = data.people ?? [];
    return people.map((p) => ({
      name: p.name,
      title: p.title,
      role: type === "strategic" ? "corp dev" : "deal partner",
      email: p.email,
      phone: p.phone_numbers?.[0]?.sanitized_number,
    }));
  } catch {
    return mockContacts(type);
  }
}

// ---------------------------------------------------------------------------
// Mock data (no API key required) — deterministic, profile-aware
// ---------------------------------------------------------------------------

function mockBuyers(
  profile: TargetProfile,
  criteria: SearchCriteria,
): BuyerCandidate[] {
  const sector = profile.industry;
  const geo = profile.geography ?? "United States";
  const strategicNames = [
    `${sector} Holdings Group`,
    `National ${sector} Corp`,
    `Summit ${sector} Partners`,
    `${cap(criteria.keywords[0] ?? sector)} Systems Inc`,
    `Meridian ${sector} Co`,
    `Allied ${sector} Group`,
    `Pinnacle ${sector} Inc`,
    `${geo.split(",")[0]} ${sector} Network`,
  ];
  const sponsorNames = [
    "Riverbend Capital Partners",
    "Highgate Equity",
    "Cumberland Private Capital",
    "Oakline Partners",
    "Brightwater Holdings",
    "Tennessee Valley Capital",
  ];

  const strategics: BuyerCandidate[] = strategicNames.map((name, i) => ({
    name,
    type: "strategic",
    industry: i % 3 === 0 ? `Adjacent to ${sector}` : sector,
    size: `${[1200, 800, 3500, 450, 2100, 600, 5000, 300][i]} employees`,
    location: i % 2 === 0 ? geo : "United States",
    website: `https://${slug(name)}.example.com`,
    description: `${name} is a ${sector.toLowerCase()} operator pursuing scale via acquisition.`,
    signals: {
      acquisitionsLast3y: [3, 1, 5, 0, 2, 1, 4, 0][i],
      employees: [1200, 800, 3500, 450, 2100, 600, 5000, 300][i],
      publicCompany: i % 4 === 0,
    },
    source: "mock",
  }));

  const sponsors: BuyerCandidate[] = sponsorNames.map((name, i) => ({
    name,
    type: "sponsor",
    industry: "Private Equity",
    size: `$${[450, 1200, 250, 800, 2000, 150][i]}M fund`,
    location: i % 2 === 0 ? geo : "United States",
    website: `https://${slug(name)}.example.com`,
    description: `${name} — ${criteria.sponsorThesis}`,
    signals: {
      peBacked: true,
      fundSizeUsdM: [450, 1200, 250, 800, 2000, 150][i],
      recentFundVintage: [2024, 2023, 2025, 2022, 2024, 2023][i],
      platformInSpace: i % 2 === 0,
    },
    source: "mock",
  }));

  return [...strategics, ...sponsors];
}

function mockContacts(type: BuyerCandidate["type"]): ContactCandidate[] {
  if (type === "strategic") {
    return [
      { name: "J. Morgan", title: "Head of Corporate Development", role: "corp dev", email: "corpdev@example.com" },
    ];
  }
  return [
    { name: "A. Reed", title: "Partner", role: "deal partner", email: "deals@example.com" },
  ];
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
