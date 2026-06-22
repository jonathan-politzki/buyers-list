import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const deals = await prisma.deal.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
  return NextResponse.json(deals);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.codeName || !body.industry || !body.description) {
    return NextResponse.json(
      { error: "codeName, industry and description are required" },
      { status: 400 },
    );
  }
  const deal = await prisma.deal.create({
    data: {
      codeName: body.codeName,
      targetName: body.targetName || null,
      industry: body.industry,
      description: body.description,
      geography: body.geography || null,
      revenueBand: body.revenueBand || null,
      ebitdaBand: body.ebitdaBand || null,
      evBand: body.evBand || null,
    },
  });
  return NextResponse.json(deal, { status: 201 });
}
