import { NextResponse } from "next/server";
import { generateBuyersList } from "@/lib/pipeline";

// Generation can take a while (sourcing + enrichment + LLM calls).
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const result = await generateBuyersList(params.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
