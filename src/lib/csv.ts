// Minimal CSV builder for the buyers-list deliverable.

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportRow {
  tier: string;
  status: string;
  score: number;
  type: string;
  buyer: string;
  industry?: string | null;
  size?: string | null;
  location?: string | null;
  website?: string | null;
  rationale?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

const HEADERS: { key: keyof ExportRow; label: string }[] = [
  { key: "tier", label: "Tier" },
  { key: "status", label: "Status" },
  { key: "score", label: "Score" },
  { key: "type", label: "Type" },
  { key: "buyer", label: "Buyer" },
  { key: "industry", label: "Industry" },
  { key: "size", label: "Size" },
  { key: "location", label: "Location" },
  { key: "website", label: "Website" },
  { key: "rationale", label: "Rationale" },
  { key: "contactName", label: "Contact" },
  { key: "contactTitle", label: "Contact Title" },
  { key: "contactEmail", label: "Contact Email" },
  { key: "notes", label: "Notes" },
];

export function toCsv(rows: ExportRow[]): string {
  const head = HEADERS.map((h) => cell(h.label)).join(",");
  const body = rows
    .map((r) => HEADERS.map((h) => cell(r[h.key])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}
