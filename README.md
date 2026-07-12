# The Spike

The Spike is a private live-session control board for fast backstage communication. It combines targeted attention flashing, short live chat, people presence, and a compact scoreboard.

The `/traffic` workspace is a consolidated live-radio workflow with persisted TrafficSA snapshots, deterministic change detection, versioned working drafts, Natasha's matching headline, explicit publishing, and read-on-air acknowledgements.

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
SUPABASE_SERVICE_ROLE_KEY=
TRAFFICSA_USERNAME=
TRAFFICSA_PASSWORD=
TRAFFICSA_URL=https://hotfm.v1.api.trafficsa.co.za/api/latest
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
CRON_SECRET=
```

If `NEXT_PUBLIC_CUE_ROOM_NAME` is missing, the app falls back to `hotdrive`.

Keep `TRAFFICSA_PASSWORD`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` server-side. Never prefix them with `NEXT_PUBLIC_`.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql`.
4. Copy the project URL and anon/publishable key into Vercel.

Apply `supabase/migrations/202607120800_traffic_workflow.sql` after the base schema. The migration is additive, preserves existing reports, removes anonymous write access to traffic reports, and changes generated reports to draft-by-default.

## Traffic Schedule

Traffic scheduling is managed only by the existing cron-job.org configuration. It calls `GET /api/cron/traffic` with `Authorization: Bearer $CRON_SECRET`. The endpoint checks TrafficSA and creates a draft only for meaningful changes (or the first current-day cycle); it never publishes automatically. Do not add Vercel Cron schedules, which would duplicate production runs.

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
