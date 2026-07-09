# The Spike

The Spike is a private silent cue board for Ian and Spike during a live radio show. It is a browser-based Vercel app that sits in its own small window beside Google Meet and sends high-contrast realtime visual cues without sound.

## What It Does

- Passcode gate before the cue board is available.
- Two identities: Ian and Spike.
- Supabase Broadcast cue events.
- Supabase Presence online status.
- Editable Supabase-backed cue presets.
- Manual cue sending and saving as a preset.
- Acknowledgements for received cues.
- Browser notifications as a secondary backup only.

## Important Show Setup

A browser app cannot force itself to stay above other Mac windows.

Use it this way during the show:

1. Open The Spike in its own browser window.
2. Place it beside Google Meet on the second display.
3. Keep it visible for the whole show.
4. Do not leave it buried in a browser tab, hidden behind another window, or minimised.
5. Treat browser notifications as backup, not the primary cue.

## Environment Variables

Create `.env.local` locally and add these variables in Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CUE_ROOM_PASSCODE=
NEXT_PUBLIC_CUE_ROOM_NAME=hotdrive
```

If `NEXT_PUBLIC_CUE_ROOM_NAME` is missing, the app falls back to `hotdrive`.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run [supabase/schema.sql](/Users/ianfraser/Documents/Codex/2026-07-09/cal/supabase/schema.sql).
4. In Supabase Realtime settings, make sure `cue_presets` is included in realtime publication if you want preset edits to appear immediately in both windows.
5. Copy the project URL and anon key into Vercel.

The table policies allow anon clients to manage cue presets because this is a private two-person room protected by the app passcode. This is private utility security, not enterprise authentication.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy To Vercel

1. Push this project to a Git provider.
2. Import it in Vercel.
3. Add the environment variables above.
4. Deploy.

The app works from the default Vercel-generated URL. No custom domain is required.
