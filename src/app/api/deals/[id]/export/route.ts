import { prisma } from "@/lib/db";
import { toCsv, type ExportRow } from "@/lib/csv";

// GET /api/deals/:id/export?status=accepted  → CSV deliverable
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status"); // optional

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      entries: {
        orderBy: [{ tier: "asc" }, { score: "desc" }],
        include: { buyer: { include: { contacts: true } } },
      },
    },
  });
  if (!deal) return new Response("not found", { status: 404 });

  const rows: ExportRow[] = deal.entries
    .filter((e) => (statusFilter ? e.status === statusFilter : e.status !== "rejected"))
    .map((e) => {
      const contact = e.buyer.contacts[0];
      return {
        tier: e.tier,
        status: e.status,
        score: e.score,
        type: e.buyer.type,
        buyer: e.buyer.name,
        industry: e.buyer.industry,
        size: e.buyer.size,
        location: e.buyer.location,
        website: e.buyer.website,
        rationale: e.rationale,
        contactName: contact?.name ?? null,
        contactTitle: contact?.title ?? null,
        contactEmail: contact?.email ?? null,
        notes: e.notes,
      };
    });

  const csv = toCsv(rows);
  const filename = `buyers-list-${deal.codeName.replace(/[^a-z0-9]+/gi, "-")}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
