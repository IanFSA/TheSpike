import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/app/lib/auth";
import { getLatestReport, saveLatestReport } from "@/app/lib/traffic-store";
import type { TrafficReport } from "@/app/types/traffic";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ report: await getLatestReport() });
}

export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const report = await request.json() as TrafficReport;
    if (!report.headline || !report.bulletin) return NextResponse.json({ error: "Headline and bulletin are required" }, { status: 400 });
    await saveLatestReport(report);
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not publish report" }, { status: 500 });
  }
}
