import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/app/lib/auth";
import { generateTrafficReport } from "@/app/lib/traffic-generate";
import { saveLatestReport } from "@/app/lib/traffic-store";
import type { TrafficIncident } from "@/app/types/traffic";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const body = await request.json() as { incidents: TrafficIncident[]; instructions?: string; closer?: string; includeCloser?: boolean; publish?: boolean };
    if (!Array.isArray(body.incidents)) return NextResponse.json({ error: "Incidents are required" }, { status: 400 });
    const report = await generateTrafficReport(body.incidents.slice(0, 15), body);
    if (body.publish) await saveLatestReport(report);
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not generate report" }, { status: 500 });
  }
}
