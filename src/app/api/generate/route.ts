import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import type { TargetProfile } from "@/lib/types";

// Generation runs Claude + web/firmographic sourcing + scoring in one request.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.codeName || !body.industry || !body.description) {
    return NextResponse.json(
      { error: "codeName, industry and description are required" },
      { status: 400 },
    );
  }
  const profile: TargetProfile = {
    codeName: body.codeName,
    targetName: body.targetName ?? null,
    industry: body.industry,
    description: body.description,
    geography: body.geography ?? null,
    revenueBand: body.revenueBand ?? null,
    ebitdaBand: body.ebitdaBand ?? null,
    evBand: body.evBand ?? null,
  };
  try {
    const list = await runPipeline(profile);
    return NextResponse.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
