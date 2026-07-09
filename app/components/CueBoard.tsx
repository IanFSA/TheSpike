"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, getRoomName } from "@/app/lib/supabase";
import type { AckEvent, CancelEvent, ChatMessage, Contestant, CueEvent, Person, TargetName } from "@/app/types/cues";

const STORAGE_USER = "the-spike-user";
const STORAGE_CHAT_TARGET = "the-spike-chat-target";
const STORAGE_ATTENTION_TARGET = "the-spike-attention-target";
const EVERYONE = "Everyone";
const ATTENTION_TIMEOUT_MS = 30_000;
const CHAT_WINDOW_HOURS = 4;

const DEFAULT_PEOPLE = [
  { name: "Ian", sort_order: 10 },
  { name: "Spike", sort_order: 20 }
];

const DEFAULT_CONTESTANTS = [1, 2, 3, 4].map((sortOrder) => ({
  name: "",
  correct_count: 0,
  wrong_count: 0,
  sort_order: sortOrder
}));

function sortedPeople(items: Person[]) {
  return [...items].filter((person) => person.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function finalScore(contestant: Contestant) {
  return Math.max(0, contestant.correct_count - contestant.wrong_count);
}

function nameListWith(list: string[] = [], name: string) {
  return Array.from(new Set([...list, name]));
}

function nameListWithout(list: string[] = [], name: string) {
  return list.filter((item) => item !== name);
}

function isForPerson(target: TargetName, person: string) {
  return target === EVERYONE || target === person;
}

function displayTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CueBoard({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_USER) || "";
  });
  const [people, setPeople] = useState<Person[]>([]);
  const [newPerson, setNewPerson] = useState("");
  const [chatTarget, setChatTarget] = useState<TargetName>(() => {
    if (typeof window === "undefined") return EVERYONE;
    return window.localStorage.getItem(STORAGE_CHAT_TARGET) || "Spike";
  });
  const [attentionTarget, setAttentionTarget] = useState<TargetName>(() => {
    if (typeof window === "undefined") return EVERYONE;
    return window.localStorage.getItem(STORAGE_ATTENTION_TARGET) || "Spike";
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [activeCue, setActiveCue] = useState<CueEvent | null>(null);
  const [pendingAttention, setPendingAttention] = useState<CueEvent | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [editingContestantId, setEditingContestantId] = useState<string | null>(null);
  const [connection, setConnection] = useState(supabaseConfigured ? "Offline" : "Supabase env missing");
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(new Date());
  const [statusNote, setStatusNote] = useState("");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const cueTimerRef = useRef<number | null>(null);
  const pendingAttentionTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const roomName = getRoomName();
  const activePeople = useMemo(() => sortedPeople(people), [people]);
  const selectableTargets = useMemo(() => [EVERYONE, ...activePeople.map((person) => person.name)], [activePeople]);
  const sortedContestants = useMemo(() => [...contestants].sort((a, b) => a.sort_order - b.sort_order), [contestants]);
  const personNames = useMemo(() => activePeople.map((person) => person.name), [activePeople]);
  const fallbackTarget = useMemo(() => personNames.find((name) => name !== user) || personNames[0] || EVERYONE, [personNames, user]);
  const effectiveChatTarget = chatTarget === EVERYONE || personNames.includes(chatTarget) ? chatTarget : fallbackTarget;
  const effectiveAttentionTarget = attentionTarget === EVERYONE || personNames.includes(attentionTarget) ? attentionTarget : fallbackTarget;
  const realtimeReady = supabaseConfigured && connection === "Live";
  const realtimeDegraded = supabaseConfigured && Boolean(user) && connection !== "Live";
  const currentUser = user || "";
  const isAttentionPending = Boolean(pendingAttention);
  const attentionLabel = effectiveAttentionTarget === EVERYONE ? "GET EVERYONE" : `GET ${effectiveAttentionTarget}`;
  const realtimeProblem = supabaseConfigured
    ? "Reconnecting live sync. Chat and scores still save, but attention alerts need Live."
    : "Missing Supabase URL and anon key in Vercel.";

  const loadPeople = useCallback(
    async (supabase: SupabaseClient) => {
      const { data, error } = await supabase
        .from("session_people")
        .select("id,room_name,name,sort_order,active,created_at,updated_at")
        .eq("room_name", roomName)
        .order("sort_order")
        .order("name");

      if (error) {
        setStatusNote("People table unavailable. Run the latest Supabase schema.");
        return;
      }

      if (!data?.length) {
        const seed = DEFAULT_PEOPLE.map((person) => ({ ...person, room_name: roomName }));
        const insert = await supabase
          .from("session_people")
          .insert(seed)
          .select("id,room_name,name,sort_order,active,created_at,updated_at")
          .order("sort_order");
        setPeople((insert.data || []) as Person[]);
        return;
      }

      setPeople(data as Person[]);
    },
    [roomName]
  );

  const loadChatMessages = useCallback(
    async (supabase: SupabaseClient) => {
      const since = new Date(Date.now() - CHAT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("chat_messages")
        .select("id,room_name,sender,recipient,body,seen_by,acknowledged_by,flashing_for,created_at")
        .eq("room_name", roomName)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(100);

      setChatMessages((data || []) as ChatMessage[]);
    },
    [roomName]
  );

  const loadContestants = useCallback(
    async (supabase: SupabaseClient) => {
      const { data } = await supabase
        .from("score_contestants")
        .select("id,room_name,name,correct_count,wrong_count,sort_order,updated_at")
        .eq("room_name", roomName)
        .order("sort_order");

      if (data?.length) {
        const rows = data as Contestant[];
        setContestants(rows);
        setNameDrafts((drafts) => {
          const next = { ...drafts };
          rows.forEach((contestant) => {
            if (contestant.id !== editingContestantId) {
              next[contestant.id] = contestant.name;
            }
          });
          return next;
        });
        return;
      }

      const seedRows = DEFAULT_CONTESTANTS.map((contestant) => ({
        ...contestant,
        room_name: roomName
      }));
      const insert = await supabase
        .from("score_contestants")
        .upsert(seedRows, { onConflict: "room_name,sort_order" })
        .select("id,room_name,name,correct_count,wrong_count,sort_order,updated_at")
        .order("sort_order");

      const rows = (insert.data || []) as Contestant[];
      setContestants(rows);
      setNameDrafts((drafts) => {
        const next = { ...drafts };
        rows.forEach((contestant) => {
          next[contestant.id] = contestant.name;
        });
        return next;
      });
    },
    [editingContestantId, roomName]
  );

  const showNotification = useCallback(async (title: string, body: string) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  }, []);

  const stopCueFlash = useCallback(() => {
    if (cueTimerRef.current) {
      window.clearTimeout(cueTimerRef.current);
      cueTimerRef.current = null;
    }
    setActiveCue(null);
  }, []);

  const stopPendingAttention = useCallback(() => {
    if (pendingAttentionTimerRef.current) {
      window.clearTimeout(pendingAttentionTimerRef.current);
      pendingAttentionTimerRef.current = null;
    }
    setPendingAttention(null);
  }, []);

  const startCueFlash = useCallback((cue: CueEvent) => {
    if (cueTimerRef.current) {
      window.clearTimeout(cueTimerRef.current);
    }
    setActiveCue(cue);
    cueTimerRef.current = window.setTimeout(() => {
      setActiveCue(null);
      cueTimerRef.current = null;
    }, ATTENTION_TIMEOUT_MS);
  }, []);

  const startPendingAttention = useCallback((cue: CueEvent) => {
    if (pendingAttentionTimerRef.current) {
      window.clearTimeout(pendingAttentionTimerRef.current);
    }
    setPendingAttention(cue);
    pendingAttentionTimerRef.current = window.setTimeout(() => {
      setPendingAttention(null);
      pendingAttentionTimerRef.current = null;
    }, ATTENTION_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((data: { authenticated: boolean }) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      if (cueTimerRef.current) window.clearTimeout(cueTimerRef.current);
      if (pendingAttentionTimerRef.current) window.clearTimeout(pendingAttentionTimerRef.current);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!authenticated || user) return;

    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) return;

    queueMicrotask(() => {
      void loadPeople(supabase);
    });
  }, [authenticated, loadPeople, user]);

  useEffect(() => {
    if (!authenticated || !user) return;

    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) return;

    queueMicrotask(() => {
      void loadPeople(supabase);
      void loadChatMessages(supabase);
      void loadContestants(supabase);
    });

    const channel = supabase.channel(`cue-room:${roomName}`, {
      config: { presence: { key: user } }
    });

    channel
      .on("broadcast", { event: "cue" }, ({ payload }: { payload: CueEvent }) => {
        if (!isForPerson(payload.to, user) || payload.from === user) return;
        startCueFlash(payload);
        setStatusNote(`${payload.from} requested ${payload.to === EVERYONE ? "everyone" : "your"} attention`);
        showNotification(`The Spike: ${payload.from}`, "Requested attention");
      })
      .on("broadcast", { event: "ack" }, ({ payload }: { payload: AckEvent }) => {
        if (payload.to !== user) return;
        stopPendingAttention();
        setStatusNote(`${payload.from} acknowledged your attention request`);
      })
      .on("broadcast", { event: "cancel-attention" }, ({ payload }: { payload: CancelEvent }) => {
        if (!isForPerson(payload.to, user) || payload.from === user) return;
        setActiveCue((cue) => (cue?.id === payload.cueId ? null : cue));
        if (cueTimerRef.current) {
          window.clearTimeout(cueTimerRef.current);
          cueTimerRef.current = null;
        }
        setStatusNote(`${payload.from} cancelled the attention request`);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const next: Record<string, boolean> = {};
        Object.keys(state).forEach((name) => {
          next[name] = Boolean(state[name]?.length);
        });
        setOnlineUsers(next);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_people", filter: `room_name=eq.${roomName}` },
        () => {
          void loadPeople(supabase);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `room_name=eq.${roomName}` },
        (payload) => {
          const change = payload as unknown as { eventType: string; new: ChatMessage };
          if (change.eventType === "INSERT" && change.new && change.new.sender !== user && isForPerson(change.new.recipient, user)) {
            const message = change.new;
            void supabase
              .from("chat_messages")
              .update({ seen_by: nameListWith(message.seen_by, user) })
              .eq("id", message.id);
          }
          void loadChatMessages(supabase);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "score_contestants", filter: `room_name=eq.${roomName}` },
        () => {
          void loadContestants(supabase);
        }
      )
      .subscribe(async (status) => {
        setConnection(status === "SUBSCRIBED" ? "Live" : status);
        if (status === "SUBSCRIBED") {
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          await channel.track({ user, onlineAt: new Date().toISOString() });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            setReconnectAttempt((attempt) => attempt + 1);
          }, 2500);
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [
    authenticated,
    loadChatMessages,
    loadContestants,
    loadPeople,
    roomName,
    showNotification,
    startCueFlash,
    stopPendingAttention,
    reconnectAttempt,
    user
  ]);

  useEffect(() => {
    if (!activeCue) {
      document.title = "The Spike";
      return;
    }

    let urgent = true;
    document.title = `!!! ${activeCue.from} needs attention`;
    const titleTimer = window.setInterval(() => {
      urgent = !urgent;
      document.title = urgent ? `!!! ${activeCue.from} needs attention` : "The Spike";
    }, 700);

    return () => {
      window.clearInterval(titleTimer);
      document.title = "The Spike";
    };
  }, [activeCue]);

  async function submitPasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const response = await fetch("/api/auth/cue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode })
    });
    const data = (await response.json()) as { success: boolean };

    if (!data.success) {
      setAuthError("That passcode did not work.");
      return;
    }

    setAuthenticated(true);
    setPasscode("");
  }

  function chooseUser(nextUser: string) {
    setUser(nextUser);
    window.localStorage.setItem(STORAGE_USER, nextUser);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setUser("");
    setActiveCue(null);
    stopPendingAttention();
  }

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = newPerson.trim().replace(/\s+/g, " ");
    const supabase = supabaseRef.current;

    if (!clean || !supabase) return;

    const sortOrder = Math.max(0, ...activePeople.map((person) => person.sort_order)) + 10;
    const { data, error } = await supabase
      .from("session_people")
      .upsert({ room_name: roomName, name: clean, sort_order: sortOrder, active: true }, { onConflict: "room_name,name" })
      .select("id,room_name,name,sort_order,active,created_at,updated_at")
      .single();

    if (!error && data) {
      setNewPerson("");
      setPeople((items) => {
        const filtered = items.filter((item) => item.id !== data.id && item.name !== data.name);
        return sortedPeople([...filtered, data as Person]);
      });
    }
  }

  async function removePerson(person: Person) {
    if (person.name === currentUser) {
      setStatusNote("Choose another user before removing yourself.");
      return;
    }

    if (!window.confirm(`Remove ${person.name} from this session?`)) return;

    setPeople((items) => items.map((item) => (item.id === person.id ? { ...item, active: false } : item)));
    await supabaseRef.current?.from("session_people").update({ active: false }).eq("id", person.id);

    if (chatTarget === person.name) changeChatTarget(EVERYONE);
    if (attentionTarget === person.name) changeAttentionTarget(EVERYONE);
  }

  async function cancelAttention() {
    if (!pendingAttention) return;

    const cancel: CancelEvent = {
      cueId: pendingAttention.id,
      from: pendingAttention.from,
      to: pendingAttention.to,
      sentAt: new Date().toISOString()
    };

    stopPendingAttention();
    setStatusNote("Cancelled");
    await channelRef.current?.send({ type: "broadcast", event: "cancel-attention", payload: cancel });
  }

  async function sendAttention() {
    if (!user || !channelRef.current || !realtimeReady) return;

    if (pendingAttention) {
      await cancelAttention();
      return;
    }

    const cue: CueEvent = {
      id: crypto.randomUUID(),
      from: user,
      to: effectiveAttentionTarget,
      sentAt: new Date().toISOString()
    };

    startPendingAttention(cue);
    setStatusNote(`Requested ${effectiveAttentionTarget === EVERYONE ? "everyone" : effectiveAttentionTarget}`);
    await channelRef.current.send({ type: "broadcast", event: "cue", payload: cue });
    await supabaseRef.current?.from("chat_messages").insert({
      room_name: roomName,
      sender: user,
      recipient: effectiveAttentionTarget,
      body: `${user} requested attention`
    });
  }

  async function acknowledgeAttention() {
    if (!activeCue || !user) return;
    const cue = activeCue;
    stopCueFlash();

    const ack: AckEvent = {
      cueId: cue.id,
      from: user,
      to: cue.from,
      sentAt: new Date().toISOString()
    };

    setStatusNote(`Acknowledged ${cue.from}`);
    await channelRef.current?.send({ type: "broadcast", event: "ack", payload: ack });
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = chatDraft.trim();
    const supabase = supabaseRef.current;

    if (!clean || !user || !supabase) return;

    setChatError("");
    const { error } = await supabase.from("chat_messages").insert({
      room_name: roomName,
      sender: user,
      recipient: effectiveChatTarget,
      body: clean
    });

    if (error) {
      setChatError("Message did not send. Try shortening it or sending again.");
      return;
    }

    setChatDraft("");
  }

  async function acknowledgeChatMessage(message: ChatMessage) {
    if (!user) return;

    await supabaseRef.current
      ?.from("chat_messages")
      .update({
        seen_by: nameListWith(message.seen_by, user),
        acknowledged_by: nameListWith(message.acknowledged_by, user),
        flashing_for: nameListWithout(message.flashing_for, user)
      })
      .eq("id", message.id);
  }

  function chatStatus(message: ChatMessage) {
    if (message.sender !== currentUser) return "";

    if (message.recipient === EVERYONE) {
      const others = activePeople.map((person) => person.name).filter((name) => name !== currentUser);
      const seenCount = others.filter((name) => message.seen_by.includes(name)).length;
      const ackCount = others.filter((name) => message.acknowledged_by.includes(name)).length;
      return `Sent - Seen ${seenCount}/${others.length} - Ack ${ackCount}/${others.length}`;
    }

    const statuses = ["Sent"];
    if (message.seen_by.includes(message.recipient)) statuses.push("Seen");
    if (message.acknowledged_by.includes(message.recipient)) statuses.push("Acknowledged");
    return statuses.join(" - ");
  }

  function changeChatTarget(nextTarget: TargetName) {
    setChatTarget(nextTarget);
    window.localStorage.setItem(STORAGE_CHAT_TARGET, nextTarget);
  }

  function changeAttentionTarget(nextTarget: TargetName) {
    setAttentionTarget(nextTarget);
    window.localStorage.setItem(STORAGE_ATTENTION_TARGET, nextTarget);
  }

  async function updateContestant(id: string, patch: Partial<Contestant>) {
    setContestants((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    await supabaseRef.current?.from("score_contestants").update(patch).eq("id", id);
  }

  async function commitContestantName(contestant: Contestant) {
    const nextName = (nameDrafts[contestant.id] ?? contestant.name).trim();
    setEditingContestantId(null);

    if (nextName === contestant.name) return;
    await updateContestant(contestant.id, { name: nextName });
  }

  async function markAnswer(contestant: Contestant, result: "correct" | "wrong") {
    const patch = result === "correct" ? { correct_count: contestant.correct_count + 1 } : { wrong_count: contestant.wrong_count + 1 };

    if (result === "wrong" && finalScore(contestant) === 0) return;
    await updateContestant(contestant.id, patch);
  }

  async function resetScores() {
    await Promise.all(
      sortedContestants.map((contestant) =>
        updateContestant(contestant.id, {
          correct_count: 0,
          wrong_count: 0
        })
      )
    );
  }

  async function testLocalAlert() {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    const cue: CueEvent = {
      id: crypto.randomUUID(),
      from: "Test",
      to: user || EVERYONE,
      sentAt: new Date().toISOString()
    };
    startCueFlash(cue);
    await showNotification("The Spike test", "Local alert is working.");
    setStatusNote("Local alert and flash tested.");
  }

  if (checkingAuth) {
    return <Centered title="The Spike" subtitle="Checking private room access..." />;
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink p-5">
        <form onSubmit={submitPasscode} className="w-full max-w-sm rounded-lg border border-line bg-panel p-5 shadow-2xl">
          <h1 className="text-4xl font-black text-signal">The Spike</h1>
          <p className="mt-2 text-sm uppercase tracking-wide text-slate-300">Private cue room</p>
          <input
            className="mt-6 w-full rounded-md border border-line bg-ink px-4 py-3 text-xl text-white"
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Passcode"
            autoFocus
          />
          {authError ? <p className="mt-3 text-warn">{authError}</p> : null}
          <button className="mt-5 w-full rounded-md bg-signal px-5 py-3 text-xl font-black text-black" type="submit">
            Enter
          </button>
        </form>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink p-5">
        <section className="w-full max-w-md rounded-lg border border-line bg-panel p-5">
          <h1 className="text-4xl font-black text-signal">The Spike</h1>
          <p className="mt-2 text-sm uppercase tracking-wide text-slate-300">Choose who is using this window</p>
          <div className="mt-5 grid gap-2">
            {activePeople.length ? (
              activePeople.map((person) => (
                <button
                  key={person.id}
                  className="rounded-md border border-line bg-white px-5 py-4 text-2xl font-black text-black"
                  onClick={() => chooseUser(person.name)}
                  type="button"
                >
                  {person.name}
                </button>
              ))
            ) : (
              <div className="rounded-md border border-line bg-ink p-4 text-sm text-slate-300">Connect once so the people list can load.</div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-ink text-white">
      {activeCue ? (
        <button
          className="cue-flash"
          aria-label={`Acknowledge attention request from ${activeCue.from}`}
          onClick={acknowledgeAttention}
          onPointerDown={acknowledgeAttention}
          type="button"
        >
          <span className="sr-only">Acknowledge attention request</span>
        </button>
      ) : null}

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-2 sm:p-3 lg:p-4">
        {realtimeDegraded ? (
          <section className="rounded-md border border-warn/60 bg-warn/15 px-3 py-2 text-warn">
            <p className="text-xs font-black uppercase">Live sync reconnecting</p>
            <div className="mt-0.5 text-xs font-bold leading-tight text-slate-200">{realtimeProblem}</div>
          </section>
        ) : null}

        <header className="rounded-lg border border-line bg-panel px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-black leading-none text-signal">The Spike</h1>
              <p className="mt-1 truncate text-xs uppercase tracking-wide text-slate-400">
                {currentUser} - {roomName} - {connection}
              </p>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
              <select
                className="min-w-0 max-w-[12rem] rounded-md border border-line bg-ink px-3 py-2 text-sm font-bold text-white sm:max-w-none"
                value={currentUser}
                onChange={(event) => chooseUser(event.target.value)}
              >
                {activePeople.map((person) => (
                  <option key={person.id} value={person.name}>
                    I am {person.name}
                  </option>
                ))}
              </select>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-black tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <button className="text-xs font-bold uppercase text-slate-400 underline-offset-4 hover:underline" onClick={logout} type="button">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)]">
          <div className="min-w-0 rounded-lg border border-line bg-panel p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Live chat</h2>
              <label className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-300">
                To
                <select
                  className="min-w-0 max-w-[11rem] rounded-md border border-line bg-ink px-2 py-1 text-white sm:max-w-none"
                  value={effectiveChatTarget}
                  onChange={(event) => changeChatTarget(event.target.value)}
                >
                  {selectableTargets.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div ref={chatRef} className="h-44 overflow-y-auto rounded-md border border-line bg-ink p-3 lg:h-52">
              {chatMessages.length ? (
                chatMessages.map((message) => {
                  const incoming = message.sender !== currentUser && isForPerson(message.recipient, currentUser);
                  const acknowledged = message.acknowledged_by.includes(currentUser);
                  return (
                    <div key={message.id} className={`mb-3 max-w-[92%] last:mb-0 ${message.sender === currentUser ? "ml-auto text-right" : ""}`}>
                      <div className={`rounded-md px-3 py-2 ${message.sender === currentUser ? "bg-cold text-black" : "bg-panel text-white"}`}>
                        <div className="mb-1 text-[11px] font-black uppercase tracking-wide opacity-70">
                          {message.sender} to {message.recipient} - {displayTime(message.created_at)}
                        </div>
                        <div className="whitespace-pre-wrap text-sm font-bold leading-snug">{message.body}</div>
                      </div>
                      {message.sender === currentUser ? (
                        <div className="mt-1 text-[11px] font-black uppercase text-slate-500">{chatStatus(message)}</div>
                      ) : incoming && !acknowledged ? (
                        <button
                          className="mt-1 rounded-md border border-line bg-signal px-2 py-1 text-xs font-black text-black"
                          onClick={() => acknowledgeChatMessage(message)}
                          type="button"
                        >
                          Acknowledge
                        </button>
                      ) : incoming ? (
                        <div className="mt-1 text-[11px] font-black uppercase text-good">Acknowledged</div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="text-sm font-bold text-slate-500">No chat in the last 4 hours</div>
              )}
            </div>

            <form className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={sendChatMessage}>
              <textarea
                className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-line bg-ink px-3 py-2 text-sm font-bold text-white"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={`Message ${effectiveChatTarget}`}
                disabled={!supabaseConfigured}
                maxLength={1000}
              />
              <button className="rounded-md bg-cold px-4 py-2 text-sm font-black text-black sm:px-5" disabled={!supabaseConfigured || !chatDraft.trim()} type="submit">
                Send
              </button>
            </form>
            {chatError ? <div className="mt-2 text-xs font-black text-warn">{chatError}</div> : null}
          </div>

          <aside className="grid min-w-0 gap-3">
            <section className="min-w-0 rounded-lg border border-line bg-panel p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Attention</h2>
                <select
                  className="min-w-0 max-w-[10rem] rounded-md border border-line bg-ink px-2 py-1 text-sm font-bold text-white"
                  value={effectiveAttentionTarget}
                  onChange={(event) => changeAttentionTarget(event.target.value)}
                >
                  {selectableTargets.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className={`h-16 w-full rounded-md border text-xl font-black leading-none transition sm:h-20 sm:text-2xl ${
                  isAttentionPending
                    ? "animate-pulse border-signal bg-signal text-black shadow-[0_0_0_4px_rgba(247,212,74,0.25)]"
                    : "border-signal bg-signal text-black active:translate-y-px"
                } ${!realtimeReady && !isAttentionPending ? "cursor-not-allowed opacity-50" : ""}`}
                disabled={!realtimeReady && !isAttentionPending}
                onClick={sendAttention}
                type="button"
              >
                {isAttentionPending ? "CANCEL" : attentionLabel}
              </button>
              <p className="mt-2 min-h-4 text-xs font-bold text-slate-400">
                {isAttentionPending ? "Waiting for acknowledgement..." : statusNote || "Ready"}
              </p>
            </section>

            <section className="min-w-0 rounded-lg border border-line bg-panel p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">People</h2>
                <button className="text-xs font-bold uppercase text-slate-400 underline-offset-4 hover:underline" onClick={testLocalAlert} type="button">
                  Test
                </button>
              </div>
              <div className="flex max-h-32 min-w-0 flex-wrap gap-1 overflow-y-auto">
                {activePeople.map((person) => (
                  <span key={person.id} className="flex max-w-full items-center gap-1 rounded-full border border-line bg-ink px-2 py-1 text-xs font-black">
                    <span className={onlineUsers[person.name] ? "shrink-0 text-good" : "shrink-0 text-slate-500"}>{onlineUsers[person.name] ? "ON" : "OFF"}</span>
                    <span className="min-w-0 truncate">{person.name}</span>
                    <button
                      className="ml-0.5 shrink-0 text-slate-500 hover:text-warn"
                      aria-label={`Remove ${person.name}`}
                      onClick={() => removePerson(person)}
                      type="button"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              <form className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={addPerson}>
                <input
                  className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 text-sm font-bold text-white"
                  value={newPerson}
                  onChange={(event) => setNewPerson(event.target.value)}
                  placeholder="Add person"
                  maxLength={40}
                />
                <button className="rounded-md border border-line bg-white px-3 py-2 text-sm font-black text-black" disabled={!newPerson.trim()} type="submit">
                  Add
                </button>
              </form>
            </section>
          </aside>
        </section>

        <section className="rounded-lg border border-line bg-panel p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Scoreboard</h2>
            <button className="rounded-md border border-line bg-ink px-3 py-2 text-xs font-black" onClick={resetScores} type="button">
              Reset
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {sortedContestants.map((contestant) => (
              <div key={contestant.id} className="rounded-lg border border-line bg-ink p-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm font-black text-white placeholder:text-slate-500"
                    value={nameDrafts[contestant.id] ?? contestant.name}
                    onBlur={() => commitContestantName(contestant)}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setNameDrafts((drafts) => ({ ...drafts, [contestant.id]: nextName }));
                    }}
                    onFocus={() => setEditingContestantId(contestant.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder={`Contestant ${contestant.sort_order}`}
                  />
                  <div className="rounded-md bg-signal px-3 py-2 text-center text-xl font-black tabular-nums text-black">{finalScore(contestant)}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="rounded-md bg-good px-3 py-3 text-lg font-black text-black" onClick={() => markAnswer(contestant, "correct")} type="button">
                    +1
                  </button>
                  <button className="rounded-md bg-warn px-3 py-3 text-lg font-black text-black" onClick={() => markAnswer(contestant, "wrong")} type="button">
                    -1
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Centered({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink p-5 text-center">
      <section>
        <h1 className="text-5xl font-black text-signal">{title}</h1>
        <p className="mt-3 text-xl text-slate-200">{subtitle}</p>
      </section>
    </main>
  );
}
