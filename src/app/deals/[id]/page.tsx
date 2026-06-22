"use client";

import { useEffect, useState } from "react";

interface Contact {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
}
interface Buyer {
  id: string;
  name: string;
  type: string;
  industry?: string | null;
  size?: string | null;
  location?: string | null;
  website?: string | null;
  source?: string | null;
  contacts: Contact[];
}
interface Entry {
  id: string;
  score: number;
  tier: string;
  status: string;
  rationale?: string | null;
  notes?: string | null;
  buyer: Buyer;
}
interface Deal {
  id: string;
  codeName: string;
  targetName?: string | null;
  industry: string;
  description: string;
  geography?: string | null;
  status: string;
  buyerThesis?: string | null;
  entries: Entry[];
}

export default function DealPage({ params }: { params: { id: string } }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    const res = await fetch(`/api/deals/${params.id}`);
    if (res.ok) setDeal(await res.json());
  }
  useEffect(() => {
    load();
  }, [params.id]);

  async function generate() {
    setGenerating(true);
    const res = await fetch(`/api/deals/${params.id}/generate`, { method: "POST" });
    setGenerating(false);
    if (!res.ok) alert("Generation failed: " + (await res.json()).error);
    await load();
  }

  async function patch(entryId: string, data: Record<string, string>) {
    await fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  }

  if (!deal) return <div className="container muted">Loading…</div>;

  const accepted = deal.entries.filter((e) => e.status === "accepted").length;
  const byTier = (t: string) => deal.entries.filter((e) => e.tier === t).length;

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1>{deal.codeName}</h1>
          <div className="sub">
            {deal.industry}
            {deal.geography ? ` · ${deal.geography}` : ""}
            {deal.targetName ? ` · ${deal.targetName}` : ""}
          </div>
        </div>
        <div className="row">
          <a href="/" className="small muted">← All mandates</a>
        </div>
      </div>

      <div className="card mt">
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Buyers list</h2>
          <div className="row">
            <button onClick={generate} disabled={generating}>
              {generating ? "Generating…" : deal.entries.length ? "Re-generate" : "Generate buyers list"}
            </button>
            {deal.entries.length > 0 && (
              <>
                <a href={`/api/deals/${deal.id}/export`}>
                  <button className="secondary" type="button">Export CSV (all)</button>
                </a>
                <a href={`/api/deals/${deal.id}/export?status=accepted`}>
                  <button className="secondary" type="button">Export accepted</button>
                </a>
              </>
            )}
          </div>
        </div>

        {deal.buyerThesis && (
          <div className="banner mt">
            <strong>Buyer thesis:</strong> {deal.buyerThesis}
          </div>
        )}

        {deal.entries.length > 0 && (
          <div className="row small muted mt" style={{ gap: 14 }}>
            <span>{deal.entries.length} buyers</span>
            <span>·</span>
            <span>Tier A {byTier("A")}</span>
            <span>Tier B {byTier("B")}</span>
            <span>Tier C {byTier("C")}</span>
            <span>·</span>
            <span>{accepted} accepted</span>
          </div>
        )}

        {deal.entries.length === 0 ? (
          <div className="muted small mt">
            No buyers yet. Click <strong>Generate buyers list</strong> to source strategics and sponsors,
            score them, and draft a tiered list.
          </div>
        ) : (
          <table className="mt">
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
              {deal.entries.map((e) => (
                <tr key={e.id} className={e.status === "rejected" ? "rejected" : ""}>
                  <td>
                    <select
                      className="tiny"
                      value={e.tier}
                      onChange={(ev) => patch(e.id, { tier: ev.target.value })}
                    >
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </td>
                  <td className="score">{e.score}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {e.buyer.website ? (
                        <a href={e.buyer.website} target="_blank" rel="noreferrer">
                          {e.buyer.name}
                        </a>
                      ) : (
                        e.buyer.name
                      )}
                    </div>
                    <div className="muted small">
                      {[e.buyer.industry, e.buyer.size, e.buyer.location].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className={`type-${e.buyer.type} small`}>{e.buyer.type}</td>
                  <td className="small" style={{ maxWidth: 280 }}>{e.rationale}</td>
                  <td className="small">
                    {e.buyer.contacts[0] ? (
                      <>
                        <div>{e.buyer.contacts[0].name}</div>
                        <div className="muted">{e.buyer.contacts[0].title}</div>
                        {e.buyer.contacts[0].email && (
                          <div className="muted">{e.buyer.contacts[0].email}</div>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="row">
                      <button
                        className="ghost"
                        style={{ color: e.status === "accepted" ? "var(--tier-a)" : undefined }}
                        onClick={() => patch(e.id, { status: e.status === "accepted" ? "pending" : "accepted" })}
                      >
                        ✓
                      </button>
                      <button
                        className="ghost"
                        style={{ color: e.status === "rejected" ? "var(--danger)" : undefined }}
                        onClick={() => patch(e.id, { status: e.status === "rejected" ? "pending" : "rejected" })}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
