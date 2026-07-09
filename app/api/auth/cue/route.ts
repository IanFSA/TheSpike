import { NextResponse } from "next/server";
import { setSessionCookie } from "@/app/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { passcode?: string };
    const expected = process.env.CUE_ROOM_PASSCODE;

    if (!expected || body.passcode !== expected) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    await setSessionCookie(response);
    return response;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
