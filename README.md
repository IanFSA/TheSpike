# The Spike

The Spike is a private live-session control board for fast backstage communication. It combines targeted attention flashing, short live chat, people presence, and a compact scoreboard.

## What It Does

- Passcode gate before the room opens.
- Add people to the session, then choose who is using each screen.
- Show people as online/offline with last-seen context.
- Remove people from the session with a soft inactive state.
- Send chat to one person or everyone.
- Show chat messages from the last 4 hours only.
- Clear chat for everyone when starting fresh.
- Show sent, seen, and acknowledged status.
- Send one targeted attention alert: `GET SPIKE`, `GET TASH`, or `GET EVERYONE`.
- Store attention requests in Supabase so active requests survive refresh/reconnect.
- Flash the receiver's screen until they click it, the sender cancels, or the 30-second timeout ends.
- Flash the sender's attention button while waiting for acknowledgement, with a cancel action.
- Track up to 4 contestants with editable names, `+1`, `-1`, and a score that cannot drop below zero.

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
3. Run `supabase/schema.sql`.
4. Copy the project URL and anon/publishable key into Vercel.

The table policies allow anon clients to use the room because this is a private utility protected by the app passcode.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Deploy To Vercel

1. Push this project to GitHub.
2. Import it in Vercel.
3. Add the environment variables above.
4. Deploy.
