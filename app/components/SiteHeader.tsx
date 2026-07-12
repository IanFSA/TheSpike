"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SiteHeaderProps = {
  active: "dashboard" | "traffic";
  user?: string;
  authenticated?: boolean;
  previewMode?: boolean;
};

export default function SiteHeader({
  active,
  user = "Authorised user",
  authenticated = false,
  previewMode = false,
}: SiteHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  const shortFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        timeZone: "Africa/Johannesburg",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [],
  );

  const fullFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        timeZone: "Africa/Johannesburg",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [],
  );

  useEffect(() => {
    const initialId = window.setTimeout(() => setNow(new Date()), 0);
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, []);

  async function logout() {
    if (previewMode) return;
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  const shortTime = now ? shortFormatter.format(now) : "--:--";
  const fullTime = now ? fullFormatter.format(now) : "--:--:--";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-panel/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-2 sm:h-16 sm:gap-4 sm:px-5">
        <Link href="/" className="shrink-0 text-lg font-black text-signal sm:text-2xl">
          The Spike
        </Link>

        <nav className="flex min-w-0 flex-1 items-stretch self-stretch">
          <Link
            href="/"
            className={`flex items-center px-2 text-[10px] font-black uppercase sm:px-3 sm:text-xs ${
              active === "dashboard"
                ? "border-b-2 border-signal text-signal"
                : "text-slate-400"
            }`}
          >
            <span className="sm:hidden">Home</span>
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <Link
            href="/traffic"
            className={`flex items-center px-2 text-[10px] font-black uppercase sm:px-3 sm:text-xs ${
              active === "traffic"
                ? "border-b-2 border-signal text-signal"
                : "text-slate-400"
            }`}
          >
            Traffic
          </Link>
        </nav>

        <div className="hidden text-xs font-bold text-slate-400 lg:block">{user}</div>

        {authenticated && !previewMode && (
          <button
            className="text-[10px] font-black uppercase text-slate-400 hover:text-signal sm:text-xs"
            onClick={logout}
          >
            Logout
          </button>
        )}

        <time className="shrink-0 text-sm font-black tabular-nums sm:text-xl">
          <span className="sm:hidden">{shortTime}</span>
          <span className="hidden sm:inline">{fullTime}</span>
        </time>
      </div>
    </header>
  );
}
