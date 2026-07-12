import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/app/lib/auth";
import { addListenerSafely } from "@/app/lib/traffic-workflow";
import type { ListenerInput } from "@/app/types/traffic";

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const input = await request.json() as ListenerInput;
  if (!input.roadName || !input.description || !input.incidentType) return NextResponse.json({ error: "Road, incident type and details are required" }, { status: 400 });
  try {
    return NextResponse.json({ incident: await addListenerSafely(input) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save listener report" }, { status: 500 });
  }
}
