import { NextResponse } from "next/server";
import { isAuthenticated } from "@/app/lib/auth";
import { fetchTrafficSA } from "@/app/lib/traffic-source";
import { getListeners } from "@/app/lib/traffic-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const [api, listeners] = await Promise.all([fetchTrafficSA(), getListeners()]);
    return NextResponse.json({ incidents: [...listeners, ...api], checkedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not fetch traffic" }, { status: 502 });
  }
}
