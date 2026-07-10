import { NextRequest, NextResponse } from "next/server";
import { generateTrafficReport } from "@/app/lib/traffic-generate";
import { fetchTrafficSA, selectRelevant, STANDARD_CLOSER } from "@/app/lib/traffic-source";
import { getListeners, saveLatestReport } from "@/app/lib/traffic-store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const [api, listeners] = await Promise.all([fetchTrafficSA(), getListeners()]);
    const selected = selectRelevant([...listeners, ...api]);
    const report = await generateTrafficReport(selected, { closer: STANDARD_CLOSER, includeCloser: true });
    await saveLatestReport(report);
    return NextResponse.json({ ok: true, reportId: report.id, incidents: selected.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cron failed" }, { status: 500 });
  }
}
