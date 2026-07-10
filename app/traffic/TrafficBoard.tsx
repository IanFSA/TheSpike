"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { isRoutineSlowTraffic, STANDARD_CLOSER } from "@/app/lib/traffic-source";
import type { ListenerInput, TrafficIncident, TrafficReport } from "@/app/types/traffic";

const emptyReport: TrafficReport = { id: "preview", headline: "No traffic report published yet", bulletin: "Generate and publish the first afternoon traffic report from the Traffic Desk.", natashaHeadline: "TRAFFIC: No headline has been prepared yet.", closer: STANDARD_CLOSER, incidentIds: [], createdAt: new Date().toISOString(), sourceCheckedAt: new Date().toISOString(), generatedBy: "fallback" };

function displayTime(value?: string) {
  if (!value) return "--:--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.split(" ")[1]?.slice(0, 5) || value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TrafficBoard() {
  const [tab, setTab] = useState<"desk" | "natasha" | "public">("desk");
  const [now, setNow] = useState(new Date());
  const [user, setUser] = useState("Spike");
  const [incidents, setIncidents] = useState<TrafficIncident[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hideSlow, setHideSlow] = useState(true);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [instructions, setInstructions] = useState("Lead with the most serious crash or closure. Keep it conversational and under 60 seconds.");
  const [closer, setCloser] = useState(STANDARD_CLOSER);
  const [includeCloser, setIncludeCloser] = useState(true);
  const [report, setReport] = useState<TrafficReport>(emptyReport);
  const [draft, setDraft] = useState<TrafficReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Loading the live feed…");
  const [listener, setListener] = useState<ListenerInput>({ roadName: "", roadCrossing: "", location: "", heading: "Northbound", incidentType: "Crash", description: "", listenerName: "", minutesActive: 60, verified: false });

  useEffect(() => {
    const storedUser = window.localStorage.getItem("the-spike-user");
    if (storedUser) queueMicrotask(() => setUser(storedUser));
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    Promise.all([fetch("/api/traffic").then((r) => r.json()), fetch("/api/traffic/report").then((r) => r.json())])
      .then(([traffic, latest]) => {
        if (traffic.incidents) {
          setIncidents(traffic.incidents);
          setSelected(new Set(traffic.incidents.filter((item: TrafficIncident) => item.priority >= 70 && !isRoutineSlowTraffic(item)).slice(0, 6).map((item: TrafficIncident) => item.id)));
          setMessage(`Traffic checked at ${displayTime(traffic.checkedAt)}.`);
        } else setMessage(traffic.error || "Could not load traffic.");
        if (latest.report) setReport(latest.report);
      }).catch(() => setMessage("Could not load the live feed."));
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(() => incidents.filter((item) => (!hideSlow || !isRoutineSlowTraffic(item)) && (!criticalOnly || item.priority >= 80)).slice(0, 40), [incidents, hideSlow, criticalOnly]);

  async function refresh() {
    setLoading(true); setMessage("Checking TrafficSA…");
    const data = await fetch("/api/traffic", { cache: "no-store" }).then((r) => r.json());
    setLoading(false);
    if (!data.incidents) return setMessage(data.error || "Could not refresh traffic.");
    setIncidents(data.incidents); setMessage(`Traffic checked at ${displayTime(data.checkedAt)}.`);
  }

  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function addListener(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("Saving listener report…");
    const response = await fetch("/api/traffic/listeners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(listener) });
    const data = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(data.error || "Could not save listener report.");
    setIncidents((items) => [data.incident, ...items]); setSelected((items) => new Set(Array.from(items).concat(data.incident.id)));
    setListener((value) => ({ ...value, roadName: "", roadCrossing: "", location: "", description: "", listenerName: "" }));
    setMessage("Listener report added to the next bulletin.");
  }

  async function generate() {
    setLoading(true); setMessage("GPT is writing the report…");
    const response = await fetch("/api/traffic/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidents: incidents.filter((item) => selected.has(item.id)), instructions, closer, includeCloser }) });
    const data = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(data.error || "Could not generate the report.");
    setDraft(data.report); setMessage("Draft ready. Review it before publishing.");
  }

  async function publish() {
    if (!draft) return;
    setLoading(true);
    const response = await fetch("/api/traffic/report", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    setLoading(false);
    if (!response.ok) return setMessage("Could not publish the report.");
    setReport(draft); setMessage("The reviewed report is now published.");
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }

  return <main className="min-h-screen bg-ink text-white">
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-2 sm:p-3 lg:p-4">
      <header className="rounded-lg border border-line bg-panel px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-3xl font-black leading-none text-signal">The Spike</h1><p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{user} - hotdrive - traffic</p></div>
          <div className="flex items-center gap-4"><div className="rounded-md border border-line bg-ink px-3 py-2 text-sm font-bold">I am {user}</div><div className="text-right"><div className="text-2xl font-black tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><button className="text-xs font-bold uppercase text-slate-400 hover:underline" onClick={logout}>Logout</button></div></div>
        </div>
      </header>
      <nav className="flex flex-wrap gap-2 rounded-lg border border-line bg-panel p-2" aria-label="The Spike sections">
        <Link className="rounded-md border border-line bg-ink px-4 py-2 text-sm font-black text-slate-300 hover:border-signal hover:text-signal" href="/">Dashboard</Link>
        <button className={`rounded-md px-4 py-2 text-sm font-black ${tab === "desk" ? "bg-signal text-black" : "border border-line bg-ink text-slate-300"}`} onClick={() => setTab("desk")}>Traffic Desk</button>
        <button className={`rounded-md px-4 py-2 text-sm font-black ${tab === "natasha" ? "bg-signal text-black" : "border border-line bg-ink text-slate-300"}`} onClick={() => setTab("natasha")}>Natasha · News</button>
        <button className={`rounded-md px-4 py-2 text-sm font-black ${tab === "public" ? "bg-signal text-black" : "border border-line bg-ink text-slate-300"}`} onClick={() => setTab("public")}>Published Report</button>
      </nav>
      <div className="rounded-md border border-good/40 bg-good/10 px-3 py-2 text-xs font-bold text-good">{message}</div>

      {tab === "desk" ? <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.7fr)]">
        <div className="grid gap-3">
          <section className="rounded-lg border border-line bg-panel p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Live incidents</h2><p className="text-xs font-bold text-slate-500">{selected.size} selected for the next report</p></div><button className="rounded-md border border-line bg-ink px-3 py-2 text-xs font-black" onClick={refresh} disabled={loading}>Refresh live feed</button></div>
            <div className="mb-2 flex flex-wrap gap-4 border-b border-line pb-3"><label className="flex items-center gap-2 text-xs font-black text-slate-300"><input className="h-4 w-4 accent-signal" type="checkbox" checked={hideSlow} onChange={(e) => setHideSlow(e.target.checked)} /> Hide slow-moving traffic</label><label className="flex items-center gap-2 text-xs font-black text-slate-300"><input className="h-4 w-4 accent-signal" type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} /> Critical only</label></div>
            <div className="max-h-[34rem] overflow-y-auto">{visible.map((item) => <label key={item.id} className={`grid cursor-pointer grid-cols-[auto_1fr_auto] gap-3 border-b border-line p-3 ${selected.has(item.id) ? "bg-ink" : ""}`}><input className="mt-1 h-4 w-4 accent-signal" type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} /><span><strong className="block text-sm">{item.incidentType} · {item.roadName || item.location}</strong><span className="mt-1 block text-xs font-bold leading-snug text-slate-300">{item.description}</span><small className="mt-1 block text-[11px] font-bold text-slate-500">{item.source === "listener" ? `Listener report${item.listenerName ? ` · ${item.listenerName}` : ""}` : "API confirmed"} · {item.heading || "Direction unknown"}</small></span><em className={`self-start rounded px-2 py-1 text-[10px] font-black not-italic ${item.priority >= 85 ? "bg-warn text-black" : item.priority >= 65 ? "bg-signal text-black" : "border border-line text-slate-400"}`}>{item.priority >= 85 ? "CRITICAL" : item.priority >= 65 ? "MAJOR" : "ROUTINE"}</em></label>)}</div>
          </section>
          <section className="rounded-lg border border-line bg-panel p-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Write my on-air report</h2><label className="mt-3 block text-xs font-black text-slate-400">Presenter instructions<textarea className="mt-1 w-full rounded-md border border-line bg-ink p-3 text-sm text-white" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
            <div className="mt-3 rounded-md border border-line bg-ink p-3"><label className="flex items-center gap-2 text-xs font-black text-slate-300"><input className="h-4 w-4 accent-signal" type="checkbox" checked={includeCloser} onChange={(e) => setIncludeCloser(e.target.checked)} /> Include standard closer</label><textarea className="mt-2 w-full rounded-md border border-line bg-panel p-3 text-sm" rows={2} value={closer} disabled={!includeCloser} onChange={(e) => setCloser(e.target.value)} /><button className="mt-2 text-xs font-black text-signal hover:underline" onClick={() => setCloser(STANDARD_CLOSER)}>Restore standard wording</button></div>
            <button className="mt-3 w-full rounded-md bg-signal px-5 py-3 text-lg font-black text-black" onClick={generate} disabled={loading || !selected.size}>Generate report</button>
            {draft ? <div className="mt-4 grid gap-2 border-t border-signal pt-4"><div className="text-xs font-black uppercase text-signal">Draft · review before publishing</div><input className="rounded-md border border-line bg-ink p-3 font-black" value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} /><textarea className="rounded-md border border-line bg-ink p-3 text-sm" rows={7} value={draft.bulletin} onChange={(e) => setDraft({ ...draft, bulletin: e.target.value })} /><textarea className="rounded-md border border-line bg-ink p-3 text-sm" rows={2} value={draft.closer} onChange={(e) => setDraft({ ...draft, closer: e.target.value })} /><div className="flex justify-end gap-2"><button className="rounded-md border border-line bg-ink px-4 py-2 font-black" onClick={() => navigator.clipboard.writeText(`${draft.bulletin}\n\n${draft.closer}`)}>Copy</button><button className="rounded-md bg-signal px-4 py-2 font-black text-black" onClick={publish}>Publish</button></div></div> : null}
          </section>
        </div>
        <form className="self-start rounded-lg border border-line bg-panel p-3" onSubmit={addListener}>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Add listener report</h2><p className="mt-1 text-xs font-bold text-slate-500">Transcribe a WhatsApp voice note.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><Field label="Road"><input required value={listener.roadName} onChange={(e) => setListener({ ...listener, roadName: e.target.value })} placeholder="N1" /></Field><Field label="Direction"><select value={listener.heading} onChange={(e) => setListener({ ...listener, heading: e.target.value })}><option>Northbound</option><option>Southbound</option><option>Eastbound</option><option>Westbound</option><option>Both directions</option><option>Unknown</option></select></Field><Field label="Nearest landmark"><input value={listener.roadCrossing} onChange={(e) => setListener({ ...listener, roadCrossing: e.target.value })} placeholder="Rivonia Road" /></Field><Field label="Area"><input value={listener.location} onChange={(e) => setListener({ ...listener, location: e.target.value })} placeholder="Sandton" /></Field><Field label="Incident"><select value={listener.incidentType} onChange={(e) => setListener({ ...listener, incidentType: e.target.value })}><option>Crash</option><option>Road closed</option><option>Obstruction</option><option>Hazard</option><option>Traffic lights</option></select></Field><Field label="Keep active"><select value={listener.minutesActive} onChange={(e) => setListener({ ...listener, minutesActive: Number(e.target.value) })}><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option></select></Field><Field label="Details"><textarea required rows={3} value={listener.description} onChange={(e) => setListener({ ...listener, description: e.target.value })} placeholder="Two vehicles, right lane blocked" /></Field><Field label="Listener"><input value={listener.listenerName} onChange={(e) => setListener({ ...listener, listenerName: e.target.value })} placeholder="Jason in Sandton" /></Field></div>
          <label className="mt-3 flex items-center gap-2 text-xs font-black text-slate-300"><input className="h-4 w-4 accent-signal" type="checkbox" checked={listener.verified} onChange={(e) => setListener({ ...listener, verified: e.target.checked })} /> Independently confirmed</label><button className="mt-3 w-full rounded-md bg-good px-4 py-3 font-black text-black" disabled={loading}>Add to next report</button>
        </form>
      </div> : null}

      {tab === "natasha" ? <section className="rounded-lg border border-line bg-panel p-4 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wide text-signal">Top-of-hour news</div><h2 className="mt-1 text-3xl font-black">Natasha’s traffic headline</h2></div><div className="text-right text-xs font-black text-slate-500">SOURCE CHECKED<br/><span className="text-xl text-white">{displayTime((draft || report).sourceCheckedAt)}</span></div></div><textarea className="mt-5 w-full rounded-md border border-line bg-ink p-5 text-2xl font-black leading-tight text-white sm:text-4xl" rows={4} value={(draft || report).natashaHeadline} onChange={(e) => setDraft({ ...(draft || report), natashaHeadline: e.target.value })} /><div className="mt-3 flex justify-end gap-2"><button className="rounded-md border border-line bg-ink px-4 py-2 font-black" onClick={() => navigator.clipboard.writeText((draft || report).natashaHeadline)}>Copy headline</button><button className="rounded-md bg-signal px-4 py-2 font-black text-black" onClick={generate} disabled={!selected.size || loading}>Regenerate</button></div></section> : null}

      {tab === "public" ? <section><div className="mb-4 text-xs font-black uppercase tracking-wide text-signal">Published {displayTime(report.createdAt)}</div><h2 className="max-w-4xl text-4xl font-black leading-none sm:text-6xl">{report.headline}</h2><div className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_.7fr]"><article className="rounded-lg border border-line bg-panel p-5 sm:p-7"><div className="mb-4 text-xs font-black uppercase tracking-wide text-slate-500">Latest report</div>{report.bulletin.split(/\n\n+/).map((part, i) => <p className="mb-4 text-lg font-bold leading-relaxed last:mb-0" key={i}>{part}</p>)}{report.closer ? <p className="mt-5 border-t border-line pt-5 text-lg font-bold text-slate-300">{report.closer}</p> : null}</article><aside className="self-start rounded-lg border border-signal bg-signal p-5 text-black"><div className="text-xs font-black uppercase">Top story</div><p className="mt-3 text-2xl font-black leading-tight">{report.natashaHeadline.replace(/^TRAFFIC:\s*/i, "")}</p></aside></div></section> : null}
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs font-black text-slate-400 [&_input]:rounded-md [&_input]:border [&_input]:border-line [&_input]:bg-ink [&_input]:p-2 [&_input]:text-white [&_select]:rounded-md [&_select]:border [&_select]:border-line [&_select]:bg-ink [&_select]:p-2 [&_select]:text-white [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-line [&_textarea]:bg-ink [&_textarea]:p-2 [&_textarea]:text-white">{label}{children}</label>;
}
