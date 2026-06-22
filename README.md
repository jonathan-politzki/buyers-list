# Buyers List Generator

An internal tool for a mid-market investment bank (Nashville) to generate, score, and
curate **sell-side buyers lists** — the tiered universe of likely acquirers (strategics
and financial sponsors) approached on behalf of a seller in an M&A process.

> Status: **MVP built.** Phase 1 runs end-to-end (intake → source → score/tier →
> curate → CSV export). It runs **with no API keys** using realistic mock data;
> add keys in `.env` to switch each integration to live data. See §Quick start.

## Quick start

```bash
npm install
cp .env.example .env          # SQLite + mock data work out of the box
npm run db:push               # create the local SQLite schema
npm run dev                   # http://localhost:3000
```

Create a mandate, click **Generate buyers list**, curate (accept/reject, re-tier,
edit), then **Export CSV**. Add `ANTHROPIC_API_KEY` for real thesis/rationale,
`APOLLO_API_KEY` for real companies/contacts, `CLAY_WEBHOOK_URL` to fan candidates
into a Clay enrichment table.

---

## 1. What it does

Given a deal mandate (the company being sold), the tool produces a **tiered, scored,
contact-enriched buyers list** that an analyst can curate and hand to the client.

```
Target profile  ─►  Buyer universe  ─►  Fit scoring  ─►  Analyst curation  ─►  Deliverable
 (CIM / teaser /     (strategics +       & tiering         (review / edit /     (Excel, CRM,
  manual intake)      sponsors)          (A / B / C)        approve)             outreach)
```

Two buyer types, sourced and scored differently:

- **Strategic buyers** — operating companies in the same or adjacent industries, large
  enough to acquire, with shown acquisition appetite. Signals: industry/SIC overlap,
  revenue/headcount, M&A history, geography, public vs. PE-backed.
- **Financial sponsors (PE)** — firms whose thesis fits. Signals: sector focus, fund
  size / vintage / dry powder, target EV (check size), and — highest value —
  **existing platform companies** in the space that would do a tuck-in / add-on.

---

## 2. Architecture (high level)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Web app (Next.js + TypeScript)                                        │
│  • Mandate intake & CIM upload   • List curation UI   • Export         │
└───────────────┬───────────────────────────────────────┬──────────────┘
                │ API routes                              │
                ▼                                         ▼
   ┌─────────────────────────┐              ┌──────────────────────────┐
   │  Generation pipeline      │             │  Postgres (Prisma)        │
   │  (background jobs/queue)   │  ◄────────► │  deals · buyers · contacts│
   │                            │             │  list_entries · activity  │
   │  1. Profile extraction     │             └──────────────────────────┘
   │  2. Buyer sourcing         │
   │  3. Fit scoring & tiering   │ ─────► Claude API (extract, score, rationale)
   │  4. Contact enrichment     │ ─────► Apollo.io (company + people search/enrich)
   │                            │ ─────► [optional] PitchBook / Grata / Crunchbase
   └─────────────────────────┘
                │
                ▼ Export
   Excel/CSV · Google Drive · CRM (DealCloud/Affinity) · outreach (Apollo/Gmail)
```

### Pipeline stages

1. **Profile extraction** — Analyst enters the target manually or uploads a teaser/CIM
   (PDF). Claude extracts a structured profile: industry, business description, revenue
   /EBITDA band, geography, customers, and the implied buyer thesis & search criteria.
2. **Buyer sourcing** — Pipeline turns the profile into search strategies and queries
   data sources: Apollo company search for strategics; a PE-firm dataset (Apollo +
   optional PitchBook/Grata) for sponsors and their portfolio platforms. Results are
   deduped and normalized into `buyers`.
3. **Fit scoring & tiering** — Each candidate scored across weighted dimensions
   (industry fit, size fit, strategic rationale, M&A appetite, geography). Claude writes
   a one-line rationale per buyer; rules + score produce **Tier A / B / C**.
4. **Contact enrichment** — For top tiers, Apollo people search pulls decision-makers
   (Corp Dev / Head of M&A for strategics; deal partners for sponsors) with email/phone.

### Curation & delivery

- Analyst reviews the ranked list, edits tiers, accepts/rejects, and adds notes.
- Approved list exports to **Excel/CSV**, **Google Drive**, or **CRM**, and optionally
  feeds a sequenced outreach workflow (Apollo sequences / Gmail drafts).

---

## 3. Data model (sketch)

| Entity         | Key fields                                                            |
| -------------- | -------------------------------------------------------------------- |
| `Deal`         | code name, target profile (industry, EV/rev/EBITDA band, geo), status |
| `Buyer`        | name, type (strategic/sponsor), industry, size, M&A signals, source   |
| `Contact`      | name, title, role (corp dev / partner), email, phone, buyer_id        |
| `ListEntry`    | deal_id, buyer_id, score, tier, status, rationale, analyst notes       |
| `Activity`     | audit trail of generation runs, edits, exports, outreach              |

---

## 4. Data sources & env

Add keys to `.env` (see `.env.example`). Everything except Anthropic + a primary data
source is optional and can be phased in.

| Variable               | Purpose                                  | Required |
| ---------------------- | ---------------------------------------- | -------- |
| `ANTHROPIC_API_KEY`    | Claude — extraction, scoring, rationale  | ✅       |
| `APOLLO_API_KEY`       | Company + people search / enrichment     | ✅       |
| `DATABASE_URL`         | DB connection (SQLite dev / Postgres prod)| ✅       |
| `CLAY_WEBHOOK_URL`     | Clay: waterfall enrichment table (push)   | optional |
| `PITCHBOOK_API_KEY`    | PE firms, funds, deal comps              | optional |
| `GRATA_API_KEY`        | Private-company / strategics discovery   | optional |
| `CRUNCHBASE_API_KEY`   | Supplemental company data                | optional |
| `GOOGLE_*` / Drive     | Export deliverables to Drive             | optional |
| CRM (DealCloud/Affinity)| Push approved list to deal CRM          | optional |

> Open question for you: which is the **system of record** for contacts/deals today
> (DealCloud, Affinity, Salesforce, spreadsheets)? That drives the export/sync design.

---

## 5. Tech stack

- **Next.js + TypeScript** — single full-stack app, easy internal deploy.
- **Postgres + Prisma** — relational fit for deals ↔ buyers ↔ contacts.
- **Claude (Opus/Sonnet 4.x)** — profile extraction, fit rationale, tiering assist.
- **Apollo.io** — primary company & contact data (already connected via MCP).
- **Background queue** — generation runs are async (sourcing + enrichment are slow).

---

## 6. Build phases

1. **MVP** — Manual target intake → Apollo strategic sourcing → Claude scoring/tiering →
   on-screen list → Excel export. (Anthropic + Apollo + Postgres only.)
2. **Sponsors & contacts** — PE-firm sourcing + platform/add-on logic; contact enrichment.
3. **Curation & delivery** — Full review UI, Google Drive / CRM export, audit trail.
4. **Outreach** — Optional sequenced outreach (Apollo/Gmail) from the approved list.

---

## 7. Open questions

1. System of record for contacts/deals (drives export/sync)?
2. Data budget — is PitchBook/Grata available, or start Apollo-only?
3. Typical deal size range (sets size-fit scoring bands)?
4. Deliverable format the client expects (Excel template? CRM view?)?
