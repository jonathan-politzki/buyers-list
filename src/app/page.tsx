"use client";

import { useEffect, useMemo, useState } from "react";
import { toCsv, type ExportRow } from "@/lib/csv";
import type { GeneratedBuyer, GeneratedList } from "@/lib/types";

type Curation = Record<string, { status?: string; tier?: string; notes?: string }>;

interface SavedDeal {
  id: string;
  codeName: string;
  targetName?: string;
  industry: string;
  description: string;
  geography?: string;
  revenueBand?: string;
  ebitdaBand?: string;
  createdAt: number;
  result?: GeneratedList;
  curation: Curation;
}

const STORE = "bl_deals_v1";

function load(): SavedDeal[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORE) || "[]");
  } catch {
    return [];
  }
}
function save(deals: SavedDeal[]) {
  localStorage.setItem(STORE, JSON.stringify(deals));
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const EMPTY_FORM = {
  codeName: "",
  targetName: "",
  industry: "",
  description: "",
  geography: "",
  revenueBand: "",
  ebitdaBand: "",
};

export default function Home() {
  const [deals, setDeals] = useState<SavedDeal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    const d = load();
    setDeals(d);
    if (d.length) {
      setSelectedId(d[0].id);
      setShowForm(false);
    }
  }, []);

  const selected = useMemo(
    () => deals.find((d) => d.id === selectedId) || null,
    [deals, selectedId],
  );

  function persist(next: SavedDeal[]) {
    setDeals(next);
    save(next);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function createAndGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.codeName || !form.industry || !form.description) return;
    const deal: SavedDeal = {
      id: uid(),
      ...form,
      createdAt: Date.now(),
      curation: {},
    };
    const next = [deal, ...deals];
    persist(next);
    setSelectedId(deal.id);
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
    await generate(deal, next);
  }

  async function generate(deal: SavedDeal, base = deals) {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deal),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("Generation failed: " + (err.error || res.status));
        return;
      }
      const result: GeneratedList = await res.json();
      persist(base.map((d) => (d.id === deal.id ? { ...d, result, curation: {} } : d)));
    } finally {
      setGenerating(false);
    }
  }

  function updateCuration(buyerId: string, patch: { status?: string; tier?: string; notes?: string }) {
    if (!selected) return;
    persist(
      deals.map((d) =>
        d.id === selected.id
          ? { ...d, curation: { ...d.curation, [buyerId]: { ...d.curation[buyerId], ...patch } } }
          : d,
      ),
    );
  }

  function removeDeal(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = deals.filter((d) => d.id !== id);
    persist(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  }

  function effective(deal: SavedDeal, b: GeneratedBuyer) {
    const c = deal.curation[b.id] || {};
    return { tier: c.tier ?? b.tier, status: c.status ?? "pending", notes: c.notes ?? "" };
  }

  function exportCsv(onlyAccepted: boolean) {
    if (!selected?.result) return;
    const rows: ExportRow[] = selected.result.buyers
      .map((b) => ({ b, e: effective(selected, b) }))
      .filter(({ e }) => (onlyAccepted ? e.status === "accepted" : e.status !== "rejected"))
      .sort((a, z) => a.e.tier.localeCompare(z.e.tier) || z.b.score - a.b.score)
      .map(({ b, e }) => ({
        tier: e.tier,
        status: e.status,
        score: b.score,
        type: b.type,
        buyer: b.name,
        industry: b.industry,
        size: b.size,
        location: b.location,
        website: b.website,
        rationale: b.rationale,
        contactName: b.contacts[0]?.name ?? null,
        contactTitle: b.contacts[0]?.title ?? null,
        contactEmail: b.contacts[0]?.email ?? null,
        notes: e.notes,
      }));
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buyers-list-${selected.codeName.replace(/[^a-z0-9]+/gi, "-")}${onlyAccepted ? "-accepted" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const buyers = selected?.result?.buyers ?? [];
  const stat = (pred: (b: GeneratedBuyer) => boolean) =>
    selected ? buyers.filter((b) => pred(b)).length : 0;
  const acceptedCount = selected
    ? buyers.filter((b) => effective(selected, b).status === "accepted").length
    : 0;

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1>Buyers List Generator</h1>
          <div className="sub">Sell-side mandate intake → tiered, scored buyers list</div>
        </div>
        {selected?.result?.sources?.length ? (
          <div className="small muted">
            <span className="srcdot" />
            sources: {selected.result.sources.join(", ")}
          </div>
        ) : null}
      </div>

      <div className="app-grid">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="card">
            <div className="row spread">
              <h2 className="section-title" style={{ margin: 0 }}>New mandate</h2>
              {!showForm && (
                <button className="ghost" onClick={() => setShowForm(true)}>+ New</button>
              )}
            </div>
            {showForm && (
              <form onSubmit={createAndGenerate}>
                <label>Deal code name *</label>
                <input value={form.codeName} onChange={set("codeName")} placeholder="Project Cumberland" required />
                <label>Target name (internal)</label>
                <input value={form.targetName} onChange={set("targetName")} placeholder="Acme HVAC Services" />
                <label>Industry *</label>
                <input value={form.industry} onChange={set("industry")} placeholder="Commercial HVAC services" required />
                <label>Business description *</label>
                <textarea value={form.description} onChange={set("description")} placeholder="What it does, customers, what's attractive…" required />
                <div className="grid cols-2">
                  <div>
                    <label>Geography</label>
                    <input value={form.geography} onChange={set("geography")} placeholder="Nashville / Southeast" />
                  </div>
                  <div>
                    <label>Revenue</label>
                    <input value={form.revenueBand} onChange={set("revenueBand")} placeholder="$40-60M" />
                  </div>
                </div>
                <label>EBITDA</label>
                <input value={form.ebitdaBand} onChange={set("ebitdaBand")} placeholder="$6-9M" />
                <div className="mt">
                  <button type="submit" disabled={generating}>
                    {generating ? <><span className="spin" />Generating…</> : "Generate buyers list"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {deals.length > 0 && (
            <div className="card mt">
              <h2 className="section-title">Saved mandates</h2>
              {deals.map((d) => (
                <div
                  key={d.id}
                  className={`mandate ${d.id === selectedId ? "active" : ""}`}
                  onClick={() => { setSelectedId(d.id); setShowForm(false); }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.codeName}</div>
                    <div className="muted small">{d.industry}{d.result ? ` · ${d.result.buyers.length} buyers` : " · not generated"}</div>
                  </div>
                  <span className="x" onClick={(e) => removeDeal(d.id, e)}>✕</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main */}
        <div>
          {!selected ? (
            <div className="emptystate">
              <div style={{ fontSize: 15, marginBottom: 6 }}>No mandate selected</div>
              <div className="small">Create a mandate on the left to generate a tiered buyers list.</div>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="row spread">
                  <div>
                    <h2 style={{ margin: 0, color: "var(--text)", textTransform: "none", fontSize: 18 }}>{selected.codeName}</h2>
                    <div className="muted small">
                      {[selected.industry, selected.geography, selected.targetName].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="row">
                    <button onClick={() => generate(selected)} disabled={generating}>
                      {generating ? <><span className="spin" />Generating…</> : selected.result ? "Re-generate" : "Generate"}
                    </button>
                    {selected.result && (
                      <>
                        <button className="secondary" onClick={() => exportCsv(false)}>Export CSV</button>
                        <button className="secondary" onClick={() => exportCsv(true)}>Export accepted</button>
                      </>
                    )}
                  </div>
                </div>

                {selected.result?.thesis && (
                  <div className="banner mt"><strong>Buyer thesis:</strong> {selected.result.thesis}</div>
                )}

                {selected.result && (
                  <div className="stats mt">
                    <div className="stat"><div className="n">{buyers.length}</div><div className="l">Buyers</div></div>
                    <div className="stat"><div className="n" style={{ color: "var(--tier-a)" }}>{stat((b) => effective(selected, b).tier === "A")}</div><div className="l">Tier A</div></div>
                    <div className="stat"><div className="n" style={{ color: "var(--tier-b)" }}>{stat((b) => effective(selected, b).tier === "B")}</div><div className="l">Tier B</div></div>
                    <div className="stat"><div className="n" style={{ color: "var(--tier-c)" }}>{stat((b) => effective(selected, b).tier === "C")}</div><div className="l">Tier C</div></div>
                    <div className="stat"><div className="n">{stat((b) => b.type === "strategic")}/{stat((b) => b.type === "sponsor")}</div><div className="l">Strat / Sponsor</div></div>
                    <div className="stat"><div className="n" style={{ color: "var(--accent)" }}>{acceptedCount}</div><div className="l">Accepted</div></div>
                  </div>
                )}
              </div>

              {generating && !selected.result && (
                <div className="emptystate mt"><span className="spin" />Sourcing strategics & sponsors, scoring, drafting rationale…</div>
              )}

              {selected.result && (
                <div className="card mt">
                  <table>
                    <thead>
                      <tr>
                        <th>Tier</th>
                        <th>Score</th>
                        <th>Buyer</th>
                        <th>Type</th>
                        <th>Rationale</th>
                        <th>Contact</th>
                        <th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyers.map((b) => {
                        const e = effective(selected, b);
                        return (
                          <tr key={b.id} className={e.status === "rejected" ? "rejected" : ""}>
                            <td>
                              <select className="tiny" value={e.tier} onChange={(ev) => updateCuration(b.id, { tier: ev.target.value })}>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                              </select>
                            </td>
                            <td>
                              <div className="scorewrap">
                                <span className="score">{b.score}</span>
                                <span className="scorebar"><span style={{ width: `${b.score}%` }} /></span>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>
                                {b.website ? <a href={b.website} target="_blank" rel="noreferrer">{b.name}</a> : b.name}
                              </div>
                              <div className="muted small">{[b.industry, b.size, b.location].filter(Boolean).join(" · ")}</div>
                            </td>
                            <td className={`type-${b.type} small`}>{b.type}</td>
                            <td className="small" style={{ maxWidth: 300 }}>{b.rationale}</td>
                            <td className="small">
                              {b.contacts[0] ? (
                                <>
                                  <div>{b.contacts[0].name}</div>
                                  <div className="muted">{b.contacts[0].title}</div>
                                  {b.contacts[0].email && <div className="muted">{b.contacts[0].email}</div>}
                                </>
                              ) : <span className="muted">—</span>}
                            </td>
                            <td>
                              <div className="row">
                                <button className="ghost" style={{ color: e.status === "accepted" ? "var(--tier-a)" : undefined }} onClick={() => updateCuration(b.id, { status: e.status === "accepted" ? "pending" : "accepted" })}>✓</button>
                                <button className="ghost" style={{ color: e.status === "rejected" ? "var(--danger)" : undefined }} onClick={() => updateCuration(b.id, { status: e.status === "rejected" ? "pending" : "rejected" })}>✕</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
