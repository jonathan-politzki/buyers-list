import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      entries: {
        orderBy: [{ score: "desc" }],
        include: { buyer: { include: { contacts: true } } },
      },
    },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(deal);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await prisma.deal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
