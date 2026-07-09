import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "the_spike_session";

function sessionSecret() {
  return process.env.CUE_ROOM_PASSCODE || "";
}

async function digest(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken() {
  const secret = sessionSecret();
  if (!secret) return "";
  return digest(`the-spike:${secret}`);
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const expected = await createSessionToken();
  return Boolean(token && expected && token === expected);
}

export async function setSessionCookie(response: NextResponse) {
  const token = await createSessionToken();
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
