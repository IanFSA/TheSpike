"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, getRoomName } from "@/app/lib/supabase";
import type { AckEvent, ChatMessage, Contestant, CueEvent, Preset, UserName } from "@/app/types/cues";

const USERS: UserName[] = ["Ian", "Spike"];
const STORAGE_USER = "the-spike-user";

const DEFAULT_PRESETS: Omit<Preset, "id">[] = [
  { sender: "Spike", label: "Look up", sort_order: 10, active: true },
  { sender: "Spike", label: "Wrap", sort_order: 20, active: true },
  { sender: "Spike", label: "Stretch", sort_order: 30, active: true },
  { sender: "Spike", label: "Time", sort_order: 40, active: true },
  { sender: "Spike", label: "Check WhatsApp", sort_order: 50, active: true },
  { sender: "Spike", label: "Problem", sort_order: 60, active: true },
  { sender: "Ian", label: "Need you", sort_order: 10, active: true },
  { sender: "Ian", label: "Look at me", sort_order: 20, active: true },
  { sender: "Ian", label: "Check WhatsApp", sort_order: 30, active: true },
  { sender: "Ian", label: "Next caller", sort_order: 40, active: true },
  { sender: "Ian", label: "Hold", sort_order: 50, active: true },
  { sender: "Ian", label: "Problem", sort_order: 60, active: true }
];

const DEFAULT_CONTESTANTS = [1, 2, 3, 4].map((sortOrder) => ({
  name: "",
  correct_count: 0,
  wrong_count: 0,
  sort_order: sortOrder
}));

const CHAT_ATTENTION_GAP_MS = 90_000;
const CHAT_FLASH_MS = 4_000;

function otherUser(user: UserName): UserName {
  return user === "Ian" ? "Spike" : "Ian";
}

function makePreset(row: Omit<Preset, "id">): Preset {
  return { ...row, id: crypto.randomUUID() };
}

function sortedPresets(items: Preset[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

function finalScore(contestant: Contestant) {
  return Math.max(0, contestant.correct_count - contestant.wrong_count);
}

function userListWith(list: UserName[] = [], user: UserName) {
  return Array.from(new Set([...list, user]));
}

function userListWithout(list: UserName[] = [], user: UserName) {
  return list.filter((name) => name !== user);
}

export default function CueBoard({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState<UserName | "">(() => {
    if (typeof window === "undefined") return "";
    const savedUser = window.localStorage.getItem(STORAGE_USER);
    return savedUser === "Ian" || savedUser === "Spike" ? savedUser : "";
  });
  const [presets, setPresets] = useState<Preset[]>(() => DEFAULT_PRESETS.map(makePreset));
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatFlashActive, setChatFlashActive] = useState(false);
  const [chatFlashKey, setChatFlashKey] = useState(0);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [editingContestantId, setEditingContestantId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [connection, setConnection] = useState(supabaseConfigured ? "Offline" : "Supabase env missing");
  const [onlineUsers, setOnlineUsers] = useState<Record<UserName, boolean>>({ Ian: false, Spike: false });
  const [lastReceived, setLastReceived] = useState<CueEvent | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [flashActive, setFlashActive] = useState(false);
  const [now, setNow] = useState(new Date());
  const [newPreset, setNewPreset] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const chatFlashTimerRef = useRef<number | null>(null);
  const lastIncomingChatAtRef = useRef<number | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const roomName = getRoomName();
  const currentUser = user || "Ian";
  const recipient = otherUser(currentUser);
  const realtimeReady = supabaseConfigured && connection === "Live";
  const realtimeProblem = supabaseConfigured
    ? "Waiting for Supabase realtime. Cues are disabled until this page says Live."
    : "Missing Supabase URL and anon key in Vercel. Cues cannot reach the other device.";
  const visiblePresets = useMemo(
    () => sortedPresets(presets.filter((preset) => preset.sender === currentUser && preset.active)),
    [currentUser, presets]
  );
  const managedPresets = useMemo(
    () => sortedPresets(presets.filter((preset) => preset.sender === currentUser)),
    [currentUser, presets]
  );
  const sortedContestants = useMemo(
    () => [...contestants].sort((a, b) => a.sort_order - b.sort_order),
    [contestants]
  );

  const loadPresets = useCallback(
    async (supabase: SupabaseClient) => {
      const { data, error } = await supabase
        .from("cue_presets")
        .select("id,label,sender,sort_order,active")
        .eq("room_name", roomName)
        .order("sender")
        .order("sort_order");

      if (error) {
        setStatusNote("Preset table unavailable. Using starter messages.");
        setPresets(DEFAULT_PRESETS.map(makePreset));
        return;
      }

      if (!data?.length) {
        const seeded = DEFAULT_PRESETS.map((preset) => ({ ...preset, room_name: roomName }));
        const insert = await supabase.from("cue_presets").insert(seeded).select("id,label,sender,sort_order,active");
        setPresets(insert.data?.length ? (insert.data as Preset[]) : DEFAULT_PRESETS.map(makePreset));
        return;
      }

      setPresets(data as Preset[]);
    },
    [roomName]
  );

  const loadChatMessages = useCallback(
    async (supabase: SupabaseClient) => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id,room_name,sender,body,seen_by,acknowledged_by,flashing_for,created_at")
        .eq("room_name", roomName)
        .order("created_at", { ascending: false })
        .limit(50);

      setChatMessages(((data || []) as ChatMessage[]).reverse());
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

  const stopFlash = useCallback(() => {
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlashActive(false);
  }, []);

  const triggerFlash = useCallback(() => {
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }
    setFlashKey((key) => key + 1);
    setFlashActive(true);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashActive(false);
      flashTimerRef.current = null;
    }, 20_000);
  }, []);

  const stopChatFlash = useCallback(
    async (message?: ChatMessage) => {
      if (chatFlashTimerRef.current) {
        window.clearTimeout(chatFlashTimerRef.current);
        chatFlashTimerRef.current = null;
      }
      setChatFlashActive(false);

      if (message && user) {
        await supabaseRef.current
          ?.from("chat_messages")
          .update({ flashing_for: userListWithout(message.flashing_for, user) })
          .eq("id", message.id);
      }
    },
    [user]
  );

  const handleIncomingChatMessage = useCallback(
    async (message: ChatMessage) => {
      if (!user || message.sender === user) return;

      const nowMs = Date.now();
      const shouldFlash = lastIncomingChatAtRef.current === null || nowMs - lastIncomingChatAtRef.current > CHAT_ATTENTION_GAP_MS;
      lastIncomingChatAtRef.current = nowMs;

      const nextSeenBy = userListWith(message.seen_by, user);
      const nextFlashingFor = shouldFlash ? userListWith(message.flashing_for, user) : message.flashing_for;

      await supabaseRef.current
        ?.from("chat_messages")
        .update({
          seen_by: nextSeenBy,
          flashing_for: nextFlashingFor
        })
        .eq("id", message.id);

      if (!shouldFlash) return;

      if (chatFlashTimerRef.current) {
        window.clearTimeout(chatFlashTimerRef.current);
      }

      setChatFlashKey((key) => key + 1);
      setChatFlashActive(true);
      const flashingMessage = { ...message, seen_by: nextSeenBy, flashing_for: nextFlashingFor };
      chatFlashTimerRef.current = window.setTimeout(() => {
        void stopChatFlash(flashingMessage);
      }, CHAT_FLASH_MS);
    },
    [stopChatFlash, user]
  );

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
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
      }
      if (chatFlashTimerRef.current) {
        window.clearTimeout(chatFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!authenticated || !user) return;

    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      return;
    }

    queueMicrotask(() => {
      void loadPresets(supabase);
      void loadChatMessages(supabase);
      void loadContestants(supabase);
    });

    const channel = supabase.channel(`cue-room:${roomName}`, {
      config: { presence: { key: user } }
    });

    channel
      .on("broadcast", { event: "cue" }, ({ payload }: { payload: CueEvent }) => {
        if (payload.to !== user) return;
        setLastReceived(payload);
        setStatusNote(`${payload.from}: ${payload.message}`);
        triggerFlash();
        showNotification(`The Spike: ${payload.from}`, payload.message);
      })
      .on("broadcast", { event: "ack" }, ({ payload }: { payload: AckEvent }) => {
        if (payload.to !== user) return;
        setStatusNote(`${payload.from} acknowledged ${payload.message}`);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineUsers({
          Ian: Boolean(state.Ian?.length),
          Spike: Boolean(state.Spike?.length)
        });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cue_presets", filter: `room_name=eq.${roomName}` },
        () => {
          void loadPresets(supabase);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `room_name=eq.${roomName}` },
        (payload) => {
          const change = payload as unknown as { eventType: string; new: ChatMessage };
          if (change.eventType === "INSERT" && change.new) {
            void handleIncomingChatMessage(change.new);
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
          await channel.track({ user, onlineAt: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [authenticated, handleIncomingChatMessage, loadChatMessages, loadContestants, loadPresets, roomName, showNotification, triggerFlash, user]);

  useEffect(() => {
    if (!lastReceived) {
      document.title = "The Spike";
      return;
    }

    let urgent = true;
    document.title = `!!! ${lastReceived.from}: ${lastReceived.message}`;
    const titleTimer = window.setInterval(() => {
      urgent = !urgent;
      document.title = urgent ? `!!! ${lastReceived.from}: ${lastReceived.message}` : "The Spike";
    }, 700);

    return () => {
      window.clearInterval(titleTimer);
      document.title = "The Spike";
    };
  }, [lastReceived]);

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

  function chooseUser(nextUser: UserName) {
    setUser(nextUser);
    window.localStorage.setItem(STORAGE_USER, nextUser);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setUser("");
    setLastReceived(null);
  }

  async function sendCue(message: string) {
    if (!message.trim() || !user) return;

    if (!channelRef.current || !realtimeReady) {
      triggerFlash();
      setStatusNote("Realtime is not connected. Add Supabase URL and anon key in Vercel.");
      return;
    }

    const cue: CueEvent = {
      id: crypto.randomUUID(),
      message: message.trim(),
      from: user,
      to: otherUser(user),
      sentAt: new Date().toISOString()
    };

    setStatusNote(`Sent to ${cue.to}: ${cue.message}`);
    await channelRef.current?.send({ type: "broadcast", event: "cue", payload: cue });
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

    await stopChatFlash(message);
    await supabaseRef.current
      ?.from("chat_messages")
      .update({
        seen_by: userListWith(message.seen_by, user),
        acknowledged_by: userListWith(message.acknowledged_by, user),
        flashing_for: userListWithout(message.flashing_for, user)
      })
      .eq("id", message.id);
  }

  function chatStatus(message: ChatMessage) {
    if (message.sender !== currentUser) return "";

    const statuses = ["Sent"];
    if (message.seen_by.includes(recipient)) statuses.push("Seen");
    if (message.flashing_for.includes(recipient)) statuses.push("Flashing");
    if (message.acknowledged_by.includes(recipient)) statuses.push("Acknowledged");

    return statuses.join(" · ");
  }

  async function acknowledgeCue() {
    if (!lastReceived || !user) return;
    stopFlash();

    const ack: AckEvent = {
      cueId: lastReceived.id,
      from: user,
      to: lastReceived.from,
      message: lastReceived.message,
      sentAt: new Date().toISOString()
    };

    setLastReceived(null);
    setStatusNote(`Acknowledged ${ack.to}`);
    await channelRef.current?.send({ type: "broadcast", event: "ack", payload: ack });
  }

  async function savePreset(label: string) {
    const clean = label.trim();
    if (!clean || !user) return;

    const supabase = supabaseRef.current;
    if (!supabase) {
      triggerFlash();
      setStatusNote("Preset saving needs Supabase URL and anon key in Vercel.");
      return;
    }

    const sortOrder = Math.max(0, ...managedPresets.map((preset) => preset.sort_order)) + 10;
    const optimistic = makePreset({ label: clean, sender: user, sort_order: sortOrder, active: true });
    setPresets((items) => [...items, optimistic]);
    setNewPreset("");

    const { data } = await supabase
      .from("cue_presets")
      .insert({ label: clean, sender: user, sort_order: sortOrder, active: true, room_name: roomName })
      .select("id,label,sender,sort_order,active")
      .single();

    if (data) {
      setPresets((items) => items.map((preset) => (preset.id === optimistic.id ? (data as Preset) : preset)));
    }
  }

  async function updatePreset(id: string, patch: Partial<Preset>) {
    setPresets((items) => items.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)));
    await supabaseRef.current?.from("cue_presets").update(patch).eq("id", id);
  }

  async function deletePreset(id: string) {
    setPresets((items) => items.filter((preset) => preset.id !== id));
    await supabaseRef.current?.from("cue_presets").delete().eq("id", id);
  }

  async function movePreset(id: string, direction: -1 | 1) {
    const list = managedPresets;
    const index = list.findIndex((preset) => preset.id === id);
    const swap = list[index + direction];
    const item = list[index];
    if (!item || !swap) return;

    await Promise.all([
      updatePreset(item.id, { sort_order: swap.sort_order }),
      updatePreset(swap.id, { sort_order: item.sort_order })
    ]);
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
    triggerFlash();
    await showNotification("The Spike test", "Local alert is working.");
    setStatusNote("Local alert and flash tested.");
  }

  if (checkingAuth) {
    return <Centered title="The Spike" subtitle="Checking private room access..." />;
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink p-5">
        <form onSubmit={submitPasscode} className="w-full max-w-sm border border-line bg-panel p-5">
          <h1 className="text-4xl font-black text-signal">The Spike</h1>
          <p className="mt-2 text-lg text-slate-200">Private cue room</p>
          <input
            className="mt-6 w-full border border-line bg-ink px-4 py-4 text-2xl text-white"
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Passcode"
            autoFocus
          />
          {authError ? <p className="mt-3 text-warn">{authError}</p> : null}
          <button className="mt-5 w-full bg-signal px-5 py-4 text-2xl font-black text-black" type="submit">
            Enter
          </button>
        </form>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink p-5">
        <section className="w-full max-w-sm border border-line bg-panel p-5">
          <h1 className="text-4xl font-black text-signal">The Spike</h1>
          <p className="mt-2 text-lg text-slate-200">Choose who is using this window.</p>
          <div className="mt-6 grid gap-3">
            {USERS.map((name) => (
              <button
                key={name}
                className="border border-line bg-white px-5 py-6 text-3xl font-black text-black"
                onClick={() => chooseUser(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-white">
      {flashActive ? (
        <button
          key={flashKey}
          className="cue-flash"
          aria-label="Stop flashing alert"
          onClick={stopFlash}
          onPointerDown={stopFlash}
          type="button"
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 sm:p-4">
        {!realtimeReady ? (
          <section className="sticky top-0 z-50 border-4 border-warn bg-warn p-4 text-black shadow-2xl">
            <p className="text-xl font-black uppercase">Realtime is not connected</p>
            <div className="mt-1 text-3xl font-black leading-tight">{realtimeProblem}</div>
          </section>
        ) : null}

        <header className="border border-line bg-panel p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black leading-none text-signal sm:text-5xl">The Spike</h1>
              <p className="mt-1 text-sm uppercase tracking-wide text-slate-300">
                {currentUser} to {recipient} - {roomName}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm font-black uppercase">
                {USERS.map((name) => (
                  <span key={name} className="border border-line bg-ink px-2 py-1">
                    <span className={onlineUsers[name] ? "text-good" : "text-slate-500"}>{onlineUsers[name] ? "ON" : "OFF"}</span> {name}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              <div className="text-sm text-slate-300">{connection}</div>
            </div>
          </div>
        </header>

        <section key={chatFlashKey} className={`border bg-panel p-3 ${chatFlashActive ? "chat-flash border-signal" : "border-line"}`}>
          <div ref={chatRef} className="max-h-36 overflow-y-auto border border-line bg-ink p-2">
            {chatMessages.length ? (
              chatMessages.map((message) => (
                <div key={message.id} className="mb-2 last:mb-0">
                  <div>
                    <span className={message.sender === currentUser ? "font-black text-cold" : "font-black text-signal"}>{message.sender}</span>
                    <span className="ml-2 whitespace-pre-wrap text-lg font-bold">{message.body}</span>
                  </div>
                  {message.sender === currentUser ? (
                    <div className="mt-1 text-xs font-black uppercase text-slate-400">{chatStatus(message)}</div>
                  ) : !message.acknowledged_by.includes(currentUser) ? (
                    <button
                      className="mt-2 border border-line bg-signal px-3 py-2 text-sm font-black text-black"
                      onClick={() => acknowledgeChatMessage(message)}
                      type="button"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <div className="mt-1 text-xs font-black uppercase text-good">Acknowledged</div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-lg font-bold text-slate-500">No chat yet</div>
            )}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={sendChatMessage}>
            <textarea
              className="min-h-14 min-w-0 flex-1 resize-none border border-line bg-ink px-3 py-3 text-xl font-black text-white"
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Chat to ${recipient}`}
              disabled={!realtimeReady}
              maxLength={1000}
            />
            <button className="bg-cold px-5 py-3 text-xl font-black text-black" disabled={!realtimeReady || !chatDraft.trim()} type="submit">
              Send
            </button>
          </form>
          {chatError ? <div className="mt-2 text-sm font-black text-warn">{chatError}</div> : null}
        </section>

        {lastReceived ? (
          <section className="border-4 border-signal bg-signal p-4 text-black">
            <p className="text-lg font-black uppercase">Cue from {lastReceived.from}</p>
            <div className="mt-1 text-5xl font-black leading-tight">{lastReceived.message}</div>
            <button className="mt-4 w-full bg-black px-5 py-4 text-2xl font-black text-white" onClick={acknowledgeCue} type="button">
              Acknowledge
            </button>
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-2">
          {visiblePresets.map((preset) => (
            <button
              key={preset.id}
              className={`min-h-24 border border-line px-3 py-5 text-2xl font-black leading-tight active:translate-y-px sm:text-3xl ${
                realtimeReady ? "bg-white text-black" : "cursor-not-allowed bg-slate-800 text-slate-400"
              }`}
              disabled={!realtimeReady}
              onClick={() => sendCue(preset.label)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </section>

        <section className="border border-line bg-panel p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black uppercase text-slate-200">Scoreboard</h2>
            <button className="border border-line bg-ink px-3 py-2 text-sm font-black" onClick={resetScores} type="button">
              Reset Scores
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sortedContestants.map((contestant) => (
              <div key={contestant.id} className="border-8 border-black bg-white p-3 text-black">
                <input
                  className="w-full border-0 bg-[#5a5f66] px-3 py-4 text-4xl font-black text-white placeholder:text-white"
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
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <button className="bg-[#00ff00] px-3 py-5 text-5xl font-black text-black" onClick={() => markAnswer(contestant, "correct")} type="button">
                    +1
                  </button>
                  <button className="bg-[#ff1010] px-3 py-5 text-5xl font-black text-white" onClick={() => markAnswer(contestant, "wrong")} type="button">
                    -1
                  </button>
                </div>
                <div className="mt-3 bg-[#5a5f66] px-3 py-4 text-center text-4xl font-black text-white">Final Score</div>
                <div className="mt-3 bg-[#fff200] px-3 py-5 text-center text-5xl font-black text-black">{finalScore(contestant)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-line bg-panel p-3">
          <div className="grid grid-cols-2 gap-2">
            <button className="border border-line bg-ink px-3 py-3 font-black" onClick={() => setManageOpen((open) => !open)} type="button">
              Manage Messages
            </button>
            <button className="border border-line bg-ink px-3 py-3 font-black" onClick={testLocalAlert} type="button">
              Test Local Alert
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <select
              className="border border-line bg-ink px-3 py-3"
              value={currentUser}
              onChange={(event) => chooseUser(event.target.value as UserName)}
            >
              {USERS.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <button className="border border-line bg-ink px-3 py-3" onClick={logout} type="button">
              Logout
            </button>
          </div>

          {manageOpen ? (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 border border-line bg-ink px-3 py-3"
                  value={newPreset}
                  onChange={(event) => setNewPreset(event.target.value)}
                  placeholder={`New ${currentUser} cue`}
                />
                <button className="bg-signal px-4 py-3 font-black text-black" onClick={() => savePreset(newPreset)} type="button">
                  Add
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {managedPresets.map((preset) => (
                  <div key={preset.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2">
                    <input
                      className="min-w-0 border border-line bg-ink px-3 py-3"
                      value={preset.label}
                      onChange={(event) => updatePreset(preset.id, { label: event.target.value })}
                    />
                    <button className="border border-line px-3" onClick={() => movePreset(preset.id, -1)} type="button">
                      Up
                    </button>
                    <button className="border border-line px-3" onClick={() => movePreset(preset.id, 1)} type="button">
                      Down
                    </button>
                    <button className="border border-line px-3" onClick={() => updatePreset(preset.id, { active: !preset.active })} type="button">
                      {preset.active ? "On" : "Off"}
                    </button>
                    <button className="border border-line px-3 text-warn" onClick={() => deletePreset(preset.id)} type="button">
                      Del
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
