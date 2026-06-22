"use client";

import { useEffect, useState } from "react";

interface DealRow {
  id: string;
  codeName: string;
  industry: string;
  status: string;
  geography?: string | null;
  _count: { entries: number };
}

export default function Home() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    codeName: "",
    targetName: "",
    industry: "",
    description: "",
    geography: "",
    revenueBand: "",
    ebitdaBand: "",
  });
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/deals");
    setDeals(await res.json());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (res.ok) {
      const deal = await res.json();
      window.location.href = `/deals/${deal.id}`;
    } else {
      alert("Failed: " + (await res.json()).error);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1>Buyers List Generator</h1>
          <div className="sub">Sell-side mandate intake → tiered, scored buyers list</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>New mandate</h2>
          <form onSubmit={create}>
            <div className="grid cols-2">
              <div>
                <label>Deal code name *</label>
                <input value={form.codeName} onChange={set("codeName")} placeholder="Project Cumberland" required />
              </div>
              <div>
                <label>Target name (internal)</label>
                <input value={form.targetName} onChange={set("targetName")} placeholder="Acme HVAC Services" />
              </div>
            </div>
            <label>Industry *</label>
            <input value={form.industry} onChange={set("industry")} placeholder="Commercial HVAC services" required />
            <label>Business description *</label>
            <textarea
              value={form.description}
              onChange={set("description")}
              placeholder="What the company does, customers, what makes it attractive…"
              required
            />
            <div className="grid cols-2">
              <div>
                <label>Geography</label>
                <input value={form.geography} onChange={set("geography")} placeholder="Tennessee / Southeast US" />
              </div>
              <div>
                <label>Revenue band</label>
                <input value={form.revenueBand} onChange={set("revenueBand")} placeholder="$40-60M" />
              </div>
            </div>
            <label>EBITDA band</label>
            <input value={form.ebitdaBand} onChange={set("ebitdaBand")} placeholder="$6-9M" />
            <div className="mt">
              <button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create mandate"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2>Mandates</h2>
          {loading ? (
            <div className="muted">Loading…</div>
          ) : deals.length === 0 ? (
            <div className="muted small">No mandates yet. Create one to generate a buyers list.</div>
          ) : (
            deals.map((d) => (
              <a key={d.id} href={`/deals/${d.id}`} style={{ display: "block" }}>
                <div className="deal-item">
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.codeName}</div>
                    <div className="muted small">
                      {d.industry}
                      {d.geography ? ` · ${d.geography}` : ""}
                    </div>
                  </div>
                  <div className="row">
                    <span className="pill">{d._count.entries} buyers</span>
                    <span className="pill">{d.status}</span>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
