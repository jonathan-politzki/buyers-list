import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Curation: analyst edits tier / status / notes on a list entry.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.tier === "string") data.tier = body.tier;
  if (typeof body.notes === "string") data.notes = body.notes;

  const entry = await prisma.listEntry.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(entry);
}
