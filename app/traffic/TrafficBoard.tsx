"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import SiteHeader from "@/app/components/SiteHeader";
import {
  filterIncidentsByWindow,
  selectRelevant,
} from "@/app/lib/traffic-source";
import {
  canUndoRead,
  freshnessLabel,
  hasNewReportSinceRead,
  sourceScheduleStatus,
} from "@/app/lib/traffic-status";
import type {
  ListenerInput,
  TrafficIncident,
  TrafficWorkspace,
} from "@/app/types/traffic";

const filters = [30, 60, 120, 180, 0] as const;
const emptyListener: ListenerInput = {
  roadName: "",
  roadCrossing: "",
  location: "",
  heading: "Northbound",
  incidentType: "Crash",
  description: "",
  listenerName: "",
  minutesActive: 60,
  verified: false,
};

type Notice = {
  kind: "success" | "warning" | "error";
  text: string;
};

type PreviewScenario =
  | "normal"
  | "changes"
  | "traffic-error"
  | "openai-error"
  | "stale";

const formatDate = (value?: string | null, seconds = false) => {
  if (!value) return "—";
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hour12: false,
  }).format(date);
  return `${day} · ${time} SAST`;
};

const formatTime = (value?: string | null, seconds = false) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hour12: false,
  }).format(new Date(value));
};

const age = (value?: string | null, now = Date.now()) => {
  if (!value) return "";
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
};

const filterLabel = (minutes: number) => {
  if (minutes === 0) return "All active";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

function reportParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function johannesburgSchedule(nowMs: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Johannesburg",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(nowMs))
      .map((part) => [part.type, part.value]),
  );
  const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
    parts.weekday,
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const weekday = weekdayIndex >= 0 && weekdayIndex <= 4;
  const active = weekday && hour >= 15 && hour < 18;

  if (active) {
    let nextHour = hour;
    let nextMinute = Math.floor(minute / 10) * 10 + 10;
    if (nextMinute >= 60) {
      nextMinute = 0;
      nextHour += 1;
    }
    return {
      active: true,
      status: "Active",
      next: `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`,
    };
  }

  if (weekday && hour < 15) {
    return { active: false, status: "Paused", next: "Today 15:00" };
  }

  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  let addDays = 1;
  if (weekdayIndex === 5) addDays = 2;
  if (weekdayIndex === 6) addDays = 1;
  if (weekdayIndex >= 0 && weekdayIndex <= 4 && hour >= 18) {
    addDays = weekdayIndex === 4 ? 3 : 1;
  }
  const nextDate = new Date(nowMs + addDays * 86_400_000);
  const nextParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Johannesburg",
      weekday: "short",
    })
      .formatToParts(nextDate)
      .map((part) => [part.type, part.value]),
  );
  const nextIndex = ["Mon", "Tue", "Wed", "Thu", "Fri"].indexOf(nextParts.weekday);
  return {
    active: false,
    status: "Paused",
    next: `${labels[Math.max(nextIndex, 0)]} 15:00`,
  };
}

function previewValues(
  data: TrafficWorkspace | null,
  scenario: PreviewScenario,
  previewMode: boolean,
) {
  if (!previewMode || !data) {
    return {
      pendingGeneration: Boolean(data?.pendingGeneration),
      pendingChangeCount: data?.pendingChangeCount ?? 0,
      lastCheckError: data?.lastCheckError ?? null,
      lastGenerationError: data?.lastGenerationError ?? null,
      lastSuccessfulCheckAt: data?.lastSuccessfulCheckAt ?? null,
      updatedDraft: data?.updatedDraft ?? null,
    };
  }

  const staleCheck = new Date(Date.now() - 42 * 60_000).toISOString();
  const simulatedUpdate = data.draft
    ? {
        ...data.draft,
        id: "preview-updated-draft",
        createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
        manuallyEdited: false,
      }
    : null;

  return {
    pendingGeneration: scenario === "changes",
    pendingChangeCount: scenario === "changes" ? 2 : 0,
    lastCheckError:
      scenario === "traffic-error"
        ? "TrafficSA could not be reached during the latest scheduled check."
        : null,
    lastGenerationError:
      scenario === "openai-error"
        ? "The updated report could not be generated. The current report was preserved."
        : null,
    lastSuccessfulCheckAt:
      scenario === "stale" ? staleCheck : data.lastSuccessfulCheckAt,
    updatedDraft: scenario === "changes" ? simulatedUpdate : null,
  };
}

export default function TrafficBoard({
  initialAuthenticated,
  previewMode = false,
  initialWorkspace = null,
}: {
  initialAuthenticated: boolean;
  previewMode?: boolean;
  initialWorkspace?: TrafficWorkspace | null;
}) {
  const [data, setData] = useState<TrafficWorkspace | null>(initialWorkspace);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [minutes, setMinutes] = useState<number>(60);
  const [editing, setEditing] = useState(false);
  const [bulletin, setBulletin] = useState(
    initialWorkspace?.draft?.bulletin || "",
  );
  const [natasha, setNatasha] = useState(
    initialWorkspace?.draft?.natashaHeadline || "",
  );
  const [settings, setSettings] = useState(false);
  const [listenerOpen, setListenerOpen] = useState(false);
  const [previewScenario, setPreviewScenario] =
    useState<PreviewScenario>("normal");
  const [listener, setListener] = useState<ListenerInput>(emptyListener);
  const [instructions, setInstructions] = useState(() =>
    previewMode
      ? "Lead with closures and serious crashes. Keep the report direct, factual and easy to read aloud."
      : typeof window === "undefined"
        ? ""
        : localStorage.getItem("traffic-presenter-instructions") || "",
  );
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(() => Date.now());
  const [user] = useState(() =>
    previewMode
      ? "Preview operator"
      : typeof window === "undefined"
        ? "Authorised user"
        : localStorage.getItem("the-spike-user") || "Authorised user",
  );
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch("/api/traffic", { cache: "no-store" });
      const next = await response.json();
      if (!response.ok) {
        throw new Error(next.error || "Could not load traffic workspace");
      }
      setData(next);
      if(!editing){
        setBulletin(next.draft?.bulletin || "");
        setNatasha(next.draft?.natashaHeadline || "");
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not load traffic workspace",
      });
    } finally {
      loadingRef.current = false;
    }
  }, [editing]);

  useEffect(() => {
    if (previewMode) {
      const clock = setInterval(() => setTick(Date.now()), 30_000);
      return () => clearInterval(clock);
    }
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => {
      setTick(Date.now());
      if(!document.hidden)void load();
    }, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load, previewMode]);

  const report = data?.draft || data?.published;
  const scenario = previewValues(data, previewScenario, previewMode);
  const visible = filterIncidentsByWindow(
    data?.snapshot?.incidents || [],
    minutes,
    tick,
  ).sort((a, b) =>
    (b.sourceModifiedAt || b.receivedAt).localeCompare(
      a.sourceModifiedAt || a.receivedAt,
    ),
  );
  const automatic = new Set(
    selectRelevant(visible).map((item) => item.fingerprint),
  );
  const considered = visible.filter(
    (item) =>
      included.has(item.fingerprint) ||
      (automatic.has(item.fingerprint) && !excluded.has(item.fingerprint)),
  );
  const undoVisible = canUndoRead(data?.lastRead?.readAt || null, tick);
  const newSinceRead =
    hasNewReportSinceRead(
      report || null,
      data?.lastRead?.reportId || null,
      data?.lastRead?.readAt || null,
    ) ||
    Boolean(
      scenario.updatedDraft &&
        data?.lastRead &&
        new Date(scenario.updatedDraft.createdAt) >
          new Date(data.lastRead.readAt),
    );
  const hasUnverified = considered.some(
    (item) => item.source === "listener" && !item.verified,
  );
  const sourceStatus = sourceScheduleStatus(
    scenario.lastSuccessfulCheckAt,
    new Date(tick),
  );
  const sourceIsStale = sourceStatus.toLowerCase().includes("stale");
  const schedule = johannesburgSchedule(tick);

  async function action(name: string, extra: Record<string, unknown> = {}) {
    setBusy(name);
    setNotice(null);

    if (previewMode) {
      const timestamp = new Date().toISOString();
      setData((current) => {
        if (!current) return current;
        if (name === "check") {
          return {
            ...current,
            lastSuccessfulCheckAt: timestamp,
            snapshot: current.snapshot
              ? { ...current.snapshot, checkedAt: timestamp }
              : null,
          };
        }
        if (name === "generate") {
          const generated = current.updatedDraft
            ? {
                ...current.updatedDraft,
                id: `mock-generated-${Date.now()}`,
                createdAt: timestamp,
                sourceCheckedAt: current.snapshot?.checkedAt || timestamp,
                status: "draft" as const,
              }
            : current.draft;
          return {
            ...current,
            draft: generated,
            updatedDraft: null,
            pendingGeneration: false,
            pendingChangeCount: 0,
          };
        }
        if (name === "publish" && current.draft) {
          const published = {
            ...current.draft,
            status: "published" as const,
            publishedAt: timestamp,
            publishedBy: user,
          };
          return { ...current, published, draft: null, updatedDraft: null };
        }
        if (name === "read") {
          const selected = current.draft || current.published;
          return {
            ...current,
            lastRead: selected
              ? { reportId: selected.id, readAt: timestamp }
              : current.lastRead,
          };
        }
        if (name === "undo-read") return { ...current, lastRead: null };
        if (name === "edit" && current.draft) {
          return {
            ...current,
            draft: {
              ...current.draft,
              bulletin: String(extra.bulletin || current.draft.bulletin),
              natashaHeadline: String(
                extra.natashaHeadline || current.draft.natashaHeadline,
              ),
              manuallyEdited: true,
            },
          };
        }
        if (name === "adopt" && current.latestTest) {
          return {
            ...current,
            draft: {
              ...current.latestTest,
              generationKind: "manual" as const,
              status: "draft" as const,
            },
            latestTest: null,
          };
        }
        if (name === "test" && current.latestTest) {
          return {
            ...current,
            latestTest: {
              ...current.latestTest,
              id: `mock-test-${Date.now()}`,
              createdAt: timestamp,
            },
          };
        }
        return current;
      });
      setNotice({
        kind: "success",
        text: `Local preview simulated “${name}”. No external service was called.`,
      });
      setBusy("");
      return true;
    }

    try {
      const response = await fetch("/api/traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: name,
          actor: user,
          minutes,
          selectedIds: considered.map((item) => item.id),
          instructions,
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Traffic action failed");
      }
      setNotice({
        kind: "success",
        text:
          name === "check"
            ? `Checked · ${result.snapshot.incidentCount} TrafficSA incidents · ${result.changes.length} meaningful changes`
            : name === "generate"
              ? "Updated working report generated. Nothing was published."
              : name === "test"
                ? "Manual pipeline test completed and kept in diagnostics."
                : "Saved.",
      });
      await load();
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Traffic action failed",
      });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function addListener(event: FormEvent) {
    event.preventDefault();
    setBusy("listener");

    if (previewMode) {
      const timestamp = new Date().toISOString();
      const fingerprint = `mock-listener-${Date.now()}`;
      const mockIncident: TrafficIncident = {
        id: fingerprint,
        fingerprint,
        source: "listener",
        sourceName: "Listener",
        incidentType: listener.incidentType,
        description: listener.description,
        roadName: listener.roadName,
        roadCrossing: listener.roadCrossing,
        location: listener.location,
        region: "GAUTENG",
        heading: listener.heading,
        sourceCreatedAt: timestamp,
        sourceModifiedAt: timestamp,
        receivedAt: timestamp,
        lastSeenAt: timestamp,
        listenerName: listener.listenerName,
        verified: listener.verified,
        expiresAt: new Date(
          Date.now() + listener.minutesActive * 60_000,
        ).toISOString(),
        priority: listener.verified ? 78 : 55,
        severity: listener.verified ? "major" : "routine",
        status: "active",
      };
      setData((current) =>
        current?.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                incidentCount: current.snapshot.incidentCount + 1,
                incidents: [mockIncident, ...current.snapshot.incidents],
              },
            }
          : current,
      );
      setListener(emptyListener);
      setNotice({
        kind: listener.verified ? "success" : "warning",
        text: "Listener report added to this browser only mock preview.",
      });
      setBusy("");
      return;
    }

    try {
      const response = await fetch("/api/traffic/listeners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listener),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not save listener report");
      }
      setListener(emptyListener);
      setListenerOpen(false);
      setNotice({
        kind: result.incident.verified ? "success" : "warning",
        text: result.incident.verified
          ? "Verified listener report saved and marked pending."
          : "Unverified listener report saved. It will not be selected automatically.",
      });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save listener report",
      });
    } finally {
      setBusy("");
    }
  }

  function toggle(item: TrafficIncident) {
    const selected = considered.some((candidate) => candidate.id === item.id);
    if (selected) {
      setIncluded((current) => {
        const next = new Set(current);
        next.delete(item.fingerprint);
        return next;
      });
      setExcluded((current) => new Set(current).add(item.fingerprint));
    } else {
      setExcluded((current) => {
        const next = new Set(current);
        next.delete(item.fingerprint);
        return next;
      });
      setIncluded((current) => new Set(current).add(item.fingerprint));
    }
  }

  if (!initialAuthenticated && !data?.authenticated) {
    return (
      <>
        <SiteHeader active="traffic" />
        <main className="mx-auto max-w-4xl p-4 sm:p-8">
          <div className="mb-3 text-xs font-black uppercase text-signal">
            Published traffic report · {formatDate(data?.published?.publishedAt)}
          </div>
          <div className="mb-3 text-xs font-bold text-warn">
            {freshnessLabel(data?.published?.publishedAt || null)}
          </div>
          <article className="rounded-lg border border-line bg-panel p-5 text-lg font-bold leading-relaxed">
            {data?.published?.bulletin ||
              "No traffic report has been published yet."}
          </article>
        </main>
      </>
    );
  }

  const trafficState = scenario.lastCheckError
    ? { label: "Check failed", tone: "error" }
    : sourceIsStale
      ? { label: "Stale", tone: "warning" }
      : { label: "Online", tone: "ok" };
  const aiState = scenario.lastGenerationError
    ? { label: "Generation failed", tone: "error" }
    : { label: "Ready", tone: "ok" };

  return (
    <>
      <SiteHeader
        active="traffic"
        user={user}
        authenticated
        previewMode={previewMode}
      />

      <main className="traffic-dashboard-shell">
        {notice && (
          <div className={`traffic-notice traffic-notice-${notice.kind}`}>
            {notice.text}
          </div>
        )}

        <section className="traffic-dashboard-grid">
          <div className="traffic-dashboard-main">
            <article className="traffic-surface traffic-report-panel">
              <header className="traffic-panel-header">
                <div>
                  <div className="traffic-eyebrow">On air traffic report</div>
                  <h1 className="traffic-title">Current traffic report</h1>
                  <div className="traffic-report-state">
                    <span className="traffic-state-dot" />
                    {report?.status === "published" ? "Published" : "Draft"}
                  </div>
                </div>

                <div className="traffic-header-actions">
                  <button
                    className="traffic-button"
                    onClick={() =>
                      navigator.clipboard.writeText(report?.bulletin || "")
                    }
                  >
                    Copy
                  </button>
                  {data?.draft && (
                    <button
                      className="traffic-button"
                      onClick={() => setEditing((value) => !value)}
                    >
                      {editing ? "Cancel" : "Edit"}
                    </button>
                  )}
                  <button
                    className="traffic-button traffic-button-primary"
                    disabled={!data?.draft || Boolean(busy)}
                    onClick={() => action("publish", { id: data?.draft?.id })}
                  >
                    Publish
                  </button>
                </div>
              </header>

              <div className="traffic-report-meta">
                <span>
                  Generated <strong>{formatDate(report?.createdAt)}</strong>
                </span>
                <span>
                  Traffic checked <strong>{formatTime(report?.sourceCheckedAt)}</strong>
                </span>
                <span>
                  <strong>{report?.incidentIds.length || 0}</strong> incidents used
                </span>
              </div>

              {(scenario.updatedDraft || newSinceRead) && (
                <div className="traffic-report-alert">
                  <span>
                    {scenario.updatedDraft
                      ? "A newer draft is available. Your current report has not been replaced."
                      : "A new report is available since you last read traffic."}
                  </span>
                  {scenario.updatedDraft && (
                    <button
                      className="traffic-button traffic-button-small"
                      onClick={() => {
                        if (previewMode && scenario.updatedDraft) {
                          setData((current) =>
                            current
                              ? {
                                  ...current,
                                  draft: scenario.updatedDraft,
                                  updatedDraft: null,
                                  pendingGeneration: false,
                                  pendingChangeCount: 0,
                                }
                              : current,
                          );
                          setPreviewScenario("normal");
                          setNotice({
                            kind: "success",
                            text: "Mock updated draft adopted.",
                          });
                        } else {
                          void action("adopt", { id: scenario.updatedDraft?.id });
                        }
                      }}
                    >
                      Review
                    </button>
                  )}
                </div>
              )}

              <div className="traffic-report-body">
                {editing && data?.draft ? (
                  <div className="traffic-edit-grid">
                    <label>
                      <span>On air report</span>
                      <textarea
                        rows={7}
                        value={bulletin}
                        onChange={(event) => setBulletin(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Natasha headline</span>
                      <textarea
                        rows={2}
                        value={natasha}
                        onChange={(event) => setNatasha(event.target.value)}
                      />
                    </label>
                    <button
                      className="traffic-button traffic-button-primary traffic-save-button"
                      onClick={async () => {
                        if(await action("edit",{
                            id: data.draft?.id,
                            version: data.draft?.version,
                            bulletin,
                            natashaHeadline: natasha,
                          })) setEditing(false);
                      }}
                    >
                      Save changes
                    </button>
                  </div>
                ) : report?.bulletin ? (
                  reportParagraphs(report.bulletin).map((paragraph, index) => (
                    <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>
                  ))
                ) : (
                  <p>No current show report available.</p>
                )}
              </div>
            </article>

            <article className="traffic-surface traffic-natasha-panel">
              <div>
                <div className="traffic-eyebrow">Natasha’s traffic headline</div>
                <p className="traffic-natasha-copy">
                  {editing
                    ? natasha
                    : report?.natashaHeadline || "No headline generated yet."}
                </p>
                <div className="traffic-natasha-meta">
                  Generated {formatTime(report?.createdAt)} · Source checked {" "}
                  {formatTime(report?.sourceCheckedAt)}
                </div>
              </div>
              <div className="traffic-header-actions">
                <button
                  className="traffic-button"
                  onClick={() =>
                    navigator.clipboard.writeText(report?.natashaHeadline || "")
                  }
                >
                  Copy
                </button>
                {data?.draft && !editing && (
                  <button
                    className="traffic-button"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </article>
          </div>

          <aside className="traffic-dashboard-side">
            <section className="traffic-surface traffic-control-panel">
              <header className="traffic-side-header">
                <div className="traffic-eyebrow">Traffic control</div>
                <h2>Live actions</h2>
              </header>

              <div className="traffic-control-list">
                <button
                  className="traffic-control-action"
                  disabled={Boolean(busy)}
                  onClick={() => action("check")}
                >
                  <span className="traffic-control-icon">↻</span>
                  <span>
                    <strong>Check traffic</strong>
                    <small>
                      Fetch the latest TrafficSA information. No report is generated.
                    </small>
                  </span>
                </button>

                <button
                  className="traffic-control-action"
                  disabled={Boolean(busy) || !considered.length}
                  onClick={() => action("generate")}
                >
                  <span className="traffic-control-icon">✦</span>
                  <span>
                    <strong>Create new report</strong>
                    <small>
                      Write a new draft from the {considered.length} selected incident
                      {considered.length === 1 ? "" : "s"}.
                    </small>
                  </span>
                </button>

                <button
                  className="traffic-control-action traffic-control-action-primary"
                  disabled={!report || Boolean(busy)}
                  onClick={() => action("read", { id: report?.id })}
                >
                  <span className="traffic-control-icon">✓</span>
                  <span>
                    <strong>Mark as read</strong>
                    <small>Record that the current report was read on air.</small>
                  </span>
                </button>

                <div className="traffic-last-read">
                  <span>
                    {data?.lastRead
                      ? `Last read on air: ${formatTime(data.lastRead.readAt)} · ${age(
                          data.lastRead.readAt,
                          tick,
                        )}`
                      : "This report has not been marked as read."}
                  </span>
                  {undoVisible && (
                    <button
                      onClick={() =>
                        action("undo-read",{id:data?.lastRead?.reportId})
                      }
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="traffic-surface traffic-system-panel">
              <header className="traffic-side-header">
                <div className="traffic-eyebrow">System status</div>
                <h2>Everything in one place</h2>
              </header>

              <div className="traffic-status-list">
                <StatusRow
                  label="TrafficSA"
                  value={trafficState.label}
                  tone={trafficState.tone}
                />
                <StatusRow label="OpenAI" value={aiState.label} tone={aiState.tone} />
                <StatusRow
                  label="Automatic checks"
                  value={schedule.status}
                  tone={schedule.active ? "ok" : "warning"}
                />
                <StatusRow
                  label="Last source check"
                  value={formatTime(scenario.lastSuccessfulCheckAt)}
                />
                <StatusRow label="Next scheduled cycle" value={schedule.next} />
                <StatusRow label="Selected incidents" value={String(considered.length)} />
                <StatusRow
                  label="Changes waiting"
                  value={
                    scenario.pendingGeneration
                      ? String(scenario.pendingChangeCount)
                      : "None"
                  }
                  tone={scenario.pendingGeneration ? "warning" : undefined}
                />
              </div>

              <button
                className="traffic-button traffic-settings-button"
                onClick={() => setSettings(true)}
              >
                System settings
              </button>
            </section>
          </aside>
        </section>

        <section className="traffic-surface traffic-incidents-panel">
          <header className="traffic-incidents-toolbar">
            <div className="traffic-incidents-heading">
              <h2>Traffic incidents</h2>
              <p>
                {considered.length} selected for the next report · {visible.length} visible
              </p>
              {hasUnverified && (
                <p className="traffic-unverified-warning">
                  Selected incidents include unverified listener information.
                </p>
              )}
            </div>

            <div className="traffic-filter-group" aria-label="Traffic time filter">
              {filters.map((value) => (
                <button
                  key={value}
                  className={`traffic-filter-button ${
                    minutes === value ? "traffic-filter-button-active" : ""
                  }`}
                  onClick={() => setMinutes(value)}
                >
                  {filterLabel(value)}
                </button>
              ))}
            </div>

            <button
              className="traffic-button"
              onClick={() => setListenerOpen((value) => !value)}
            >
              Add listener report
            </button>
          </header>

          {listenerOpen && (
            <form className="traffic-listener-form" onSubmit={addListener}>
              <div className="traffic-listener-form-head">
                <div>
                  <h3>Add listener report</h3>
                  <p>Unverified reports are never selected automatically.</p>
                </div>
                <button
                  type="button"
                  className="traffic-button"
                  onClick={() => setListenerOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="traffic-listener-grid">
                <Field label="Road">
                  <input
                    required
                    value={listener.roadName}
                    onChange={(event) =>
                      setListener({ ...listener, roadName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Direction">
                  <select
                    value={listener.heading}
                    onChange={(event) =>
                      setListener({ ...listener, heading: event.target.value })
                    }
                  >
                    <option>Northbound</option>
                    <option>Southbound</option>
                    <option>Eastbound</option>
                    <option>Westbound</option>
                    <option>Both directions</option>
                  </select>
                </Field>
                <Field label="Landmark">
                  <input
                    value={listener.roadCrossing}
                    onChange={(event) =>
                      setListener({ ...listener, roadCrossing: event.target.value })
                    }
                  />
                </Field>
                <Field label="Area">
                  <input
                    value={listener.location}
                    onChange={(event) =>
                      setListener({ ...listener, location: event.target.value })
                    }
                  />
                </Field>
                <Field label="Incident">
                  <select
                    value={listener.incidentType}
                    onChange={(event) =>
                      setListener({ ...listener, incidentType: event.target.value })
                    }
                  >
                    <option>Crash</option>
                    <option>Road closed</option>
                    <option>Obstruction</option>
                    <option>Congestion</option>
                  </select>
                </Field>
                <Field label="Expires">
                  <select
                    value={listener.minutesActive}
                    onChange={(event) =>
                      setListener({
                        ...listener,
                        minutesActive: Number(event.target.value),
                      })
                    }
                  >
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">90 minutes</option>
                  </select>
                </Field>
                <Field label="Details">
                  <textarea
                    required
                    value={listener.description}
                    onChange={(event) =>
                      setListener({ ...listener, description: event.target.value })
                    }
                  />
                </Field>
                <Field label="Listener">
                  <input
                    value={listener.listenerName}
                    onChange={(event) =>
                      setListener({ ...listener, listenerName: event.target.value })
                    }
                  />
                </Field>
              </div>

              <label className="traffic-listener-confirm">
                <input
                  type="checkbox"
                  checked={listener.verified}
                  onChange={(event) =>
                    setListener({ ...listener, verified: event.target.checked })
                  }
                />
                Independently confirmed
              </label>

              <button
                className="traffic-button traffic-button-primary"
                disabled={Boolean(busy)}
              >
                Save listener report
              </button>
            </form>
          )}

          <div className="traffic-incident-list">
            {visible.map((item) => (
              <Incident
                key={item.id}
                item={item}
                selected={considered.some((candidate) => candidate.id === item.id)}
                toggle={toggle}
                now={tick}
              />
            ))}
          </div>
        </section>
      </main>

      {settings && (
        <div
          className="traffic-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettings(false);
          }}
        >
          <aside className="traffic-settings-drawer" aria-label="System settings">
            <header className="traffic-drawer-header">
              <div>
                <div className="traffic-eyebrow">System settings</div>
                <h2>Traffic workspace</h2>
              </div>
              <button className="traffic-button" onClick={() => setSettings(false)}>
                Close
              </button>
            </header>

            <section className="traffic-drawer-section">
              <h3>Presenter instructions</h3>
              <textarea
                rows={5}
                value={instructions}
                onChange={(event) => {
                  setInstructions(event.target.value);
                  localStorage.setItem(
                    "traffic-presenter-instructions",
                    event.target.value,
                  );
                }}
              />
            </section>

            <section className="traffic-drawer-section">
              <h3>Automatic schedule</h3>
              <div className="traffic-status-list">
                <StatusRow label="Days" value="Monday to Friday" />
                <StatusRow label="Hours" value="15:00 to 18:00 SAST" />
                <StatusRow label="Interval" value="Every 10 minutes" />
              </div>
            </section>

            <section className="traffic-drawer-section">
              <h3>Diagnostics</h3>
              <div className="traffic-status-list">
                <StatusRow
                  label="TrafficSA"
                  value={
                    scenario.lastCheckError
                      ? scenario.lastCheckError
                      : `Last successful check ${formatDate(
                          scenario.lastSuccessfulCheckAt,
                        )}`
                  }
                  tone={scenario.lastCheckError ? "error" : "ok"}
                />
                <StatusRow
                  label="OpenAI"
                  value={scenario.lastGenerationError || "No recorded generation error"}
                  tone={scenario.lastGenerationError ? "error" : "ok"}
                />
                {data?.latestTest && (
                  <>
                    <StatusRow
                      label="Latest test"
                      value={formatDate(data.latestTest.createdAt)}
                    />
                    <StatusRow
                      label="Model"
                      value={data.latestTest.model || "—"}
                    />
                    <StatusRow
                      label="Token usage"
                      value={`${data.latestTest.inputTokens} in · ${data.latestTest.outputTokens} out`}
                    />
                    <StatusRow
                      label="Generation time"
                      value={`${data.latestTest.generationMs} ms`}
                    />
                  </>
                )}
              </div>

              <div className="traffic-drawer-actions">
                <button
                  className="traffic-button"
                  disabled={Boolean(busy)}
                  onClick={() => action("test")}
                >
                  Test full pipeline
                </button>
                {data?.latestTest && (
                  <button
                    className="traffic-button"
                    onClick={() => action("adopt", { id: data.latestTest?.id })}
                  >
                    Adopt test as working draft
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}

      {previewMode && (
        <div className="traffic-preview-tools">
          <span>Local mock preview</span>
          <select
            value={previewScenario}
            onChange={(event) =>
              setPreviewScenario(event.target.value as PreviewScenario)
            }
          >
            <option value="normal">Normal</option>
            <option value="changes">New incidents</option>
            <option value="traffic-error">TrafficSA failure</option>
            <option value="openai-error">OpenAI failure</option>
            <option value="stale">Stale source</option>
          </select>
        </div>
      )}
    </>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="traffic-status-row">
      <span>{label}</span>
      <strong className={tone ? `traffic-status-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function Incident({
  item,
  selected,
  toggle,
  now,
}: {
  item: TrafficIncident;
  selected: boolean;
  toggle: (item: TrafficIncident) => void;
  now: number;
}) {
  const sourceLabel =
    item.source === "listener"
      ? item.verified
        ? "Listener confirmed"
        : "Listener unverified"
      : item.sourceName;
  const primaryLocation =
    item.roadCrossing || item.location || "Location unavailable";

  return (
    <article className="traffic-incident-row">
      <label className="traffic-incident-check" aria-label="Select incident">
        <input type="checkbox" checked={selected} onChange={() => toggle(item)} />
      </label>

      <div className="traffic-incident-content">
        <div className="traffic-incident-topline">
          <strong>
            {item.roadName || "Road unavailable"} {item.heading || ""} · {" "}
            {primaryLocation}
          </strong>
          <div className="traffic-incident-badges">
            <span className={`traffic-severity traffic-severity-${item.severity}`}>
              {item.severity}
            </span>
            <span className="traffic-provider">{sourceLabel}</span>
          </div>
        </div>

        <p>{item.description}</p>

        <div className="traffic-incident-meta">
          <span>
            Reported {formatTime(item.sourceCreatedAt, true)} · Received {" "}
            {formatTime(item.receivedAt, true)} · {" "}
            {age(item.sourceModifiedAt || item.receivedAt, now)}
          </span>
          <details>
            <summary>More details</summary>
            <div>
              Source incident: {" "}
              {item.sourceCreatedAt
                ? formatDate(item.sourceCreatedAt, true)
                : "Source timestamp unavailable"}
              <br />
              Received by The Spike: {formatDate(item.receivedAt, true)}
              <br />
              Last seen: {formatDate(item.lastSeenAt, true)}
              <br />
              Source updated: {formatDate(item.sourceModifiedAt, true)}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="traffic-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
