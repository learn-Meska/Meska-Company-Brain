# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## GitHub: always push with the GITHUB_PAT

In this folder, always authenticate to GitHub with the `GITHUB_PAT` from `.env.local` (account `learn-Meska`), never the machine's default `gh`/git login. The push target is always `learn-Meska/Meska-Company-Brain` (`origin`). Run commands from the repo root in Git Bash, and never print or commit the token:

```bash
export GH_TOKEN=$(grep -E '^GITHUB_PAT=' .env.local | cut -d= -f2- | tr -d '\r"'"'"' ')
git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin <branch>
```

With `GH_TOKEN` exported, `gh` commands (PRs, API calls) also act as `learn-Meska`.

## What this is

Meska Training Center (package name `meska-company-brain`) is an internal app for Meska AI's Programs, Learning & Delivery team. Growth staff request multi-day trainings, booking managers assign freelance trainers who are available and match the request, trainers confirm or decline, and participants leave anonymous feedback through a QR code. That feedback feeds each trainer's score and tier.

Stack: Next.js 16 App Router (React 19, Turbopack, Tailwind v4), Supabase (Postgres, Auth, Storage), Gmail SMTP through nodemailer, deployed on Vercel.

**This Next.js version has breaking changes from what you may know.** Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`). For example, middleware is now `src/proxy.ts`, which exports `proxy`.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm run build
npm run lint         # eslint (flat config, eslint-config-next)
npx tsc --noEmit     # typecheck
node --env-file=.env.local scripts/create-admin.mjs "Full Name" email@example.com   # create or re-link the first admin; prints a set-password link
node --env-file=.env.local scripts/import-feedback.mjs path/to/scorecard.html       # one-off import of historical feedback
```

There is no test suite.

Env vars are listed in `.env.example`. `.env.local` is gitignored, and production values live in Vercel's project settings. `SITE_URL` must be the deployed URL in Vercel because it builds every link in emails.

## Architecture

**Data access is server-only, through the service-role client.** `src/lib/supabase.ts` exposes `authClient()`, a cookie-based client used only to find out who is signed in, and `db()`, a client using `SUPABASE_SECRET_KEY` that does every read and write. RLS does not protect anything, so every server action and route must check permissions with the `require*` helpers in `src/lib/auth.ts` before calling `db()`. Never use `db()` from client components. Every export of a `"use server"` file can be called directly from the browser with any arguments. So each export checks auth itself and rebuilds rows from known fields (never spread client objects into inserts or updates). Helpers that skip auth go in `server-only` modules under `src/lib` instead. PostgREST returns at most 1,000 rows per request, so read anything that can grow with `fetchAll()`. Guard state changes on the state you checked, e.g. `.eq("status", b.status)` followed by `.select("id")`, and treat 0 returned rows as "changed meanwhile".

**The database schema is not in this repo.** Tables, triggers, storage buckets (`photos`, `cvs`, `materials`) and the hourly pg_cron job live in the Supabase project, which `NEXT_PUBLIC_SUPABASE_URL` points to. Inspect it with the Supabase MCP tools before changing queries. Database triggers enforce booking rules and raise errors (`slot_already_booked`, `trainer_not_available`, `time_outside_slots`), which `friendlyError()` in `src/lib/format.ts` turns into readable messages. `slotsFor()` in that file must stay in sync with the database function `slots_for()`.

**Roles and views.** Roles are `admin`, `approver` (shown as "Booking manager"), `growth` and `trainer`, stored in `app_users.roles[]`. The highest role becomes `app_users.role`. A login can switch between the views it holds, and admins can preview any view, through the `view_as` cookie. `getCurrentUser()` resolves the active `role`, `real_role`, the available `views`, and `trainer_id` if the login is linked to a `trainers` row. Check permissions with the helpers (`canBook`, `canManageTrainers`, `canEditSettings`, `requireTrainer`, …) instead of comparing role strings.

**Auth.** `src/proxy.ts` redirects to `/login` for any path not listed in `PUBLIC`. The public paths are `/login`, `/forgot-password`, `/auth/*`, `/api/cron/*`, and `/f/*`, the participant feedback form. Invites and password resets avoid Supabase's own emails: `accessLink()` in `src/lib/access-link.ts` generates a token link to `/auth/confirm`. That page uses up the one-time token only when the user presses Continue (the `confirmLink` action), so mail scanners that prefetch links can't burn it, then sends them to `/auth/set-password`. `accessLink` must never be exported from a `"use server"` file, because it signs anyone in. The `next` parameter after sign-in goes through `safeNext()`.

**Booking lifecycle.** The labels are in `STATUS_LABEL`, and the logic is in `src/app/(app)/bookings/actions.ts`:
`needs_trainer` (Growth's `createRequest`; a multi-day request shares one `batch_id` with one row per day) → `awaiting_trainer` (a manager's `assignTrainer`) → `confirmed`, or back to `needs_trainer` if the trainer declines in `respondBooking`. Bookings can also become `cancelled`. Free slots come from `availability` rows minus `booking_locks`; see `searchTrainers()` in `src/lib/search.ts`. A day has two slots: morning (9 AM–5 PM) and evening (6 PM–11 PM).

**Time rules (Cairo time, `src/lib/format.ts`).** Trainers only see the program (client) name 48 hours before the session (`programVisible`, `trainerTitle`, and `bookingRows(b, forTrainer=true)`). Anything shown or emailed to a trainer must go through these helpers. The participant feedback form is open from the session start until 6 hours after it ends (`feedbackWindow`).

**Side effects.** Every state change calls `audit()`, which writes to `audit_log` (labels in `AUDIT_LABEL`), and `notify()` in `src/lib/notify.ts`. `notify()` creates an in-app notification for recipients who have an account, shown by the bell, and optionally sends an email. Trainers who haven't accepted their invite get email only. `sendEmail()` first writes every message to `email_outbox`. Without Gmail credentials the message stays `queued` and nothing is sent. Messages Gmail rejects are marked `failed`. Both scheduled jobs call `retryFailedEmails()`, which re-sends the email only (up to 3 attempts within 2 days), so jobs never re-send bell notifications. All emails use `emailLayout()`. The profile PDF fonts are Latin-only, so text goes through `pdfText()`, and saving a profile warns when some characters can't be printed.

**Scoring.** `src/lib/scoring.ts` builds `TrainerProfile`s by combining weighted `score_categories` (entered by hand, or taken from feedback), participant feedback, `score_override` and `tiers`. Admins and booking managers configure these in `/admin/settings`. Values tunable at runtime are read through `getSetting(key, fallback)` from the `settings` table.

**Scheduled jobs.** Both are protected by `Authorization: Bearer $CRON_SECRET`.
- `/api/cron/reminders` runs daily from `vercel.json`. It reminds trainers who haven't confirmed after `settings.trainer_response.hours`, and sends availability reminders.
- `/api/cron/feedback` runs hourly from Supabase pg_cron. It emails each trainer their feedback summary once the form closes.

**Files.** Uploads go straight from the browser to Supabase Storage through one-time signed upload URLs (`create*Upload` → `record*`/`save*` server actions), so they skip Vercel's body-size limit. The trainer bio PDF (`/trainers/[id]/bio`, built with `@react-pdf/renderer`) reads its fonts from `src/fonts` at runtime, which `next.config.ts` traces into the build.

**Routes.** `src/app/(app)` holds the signed-in pages, sharing a layout with the nav and bell. `src/app/(auth)` holds the login and forgot-password pages. Pages use server components, and mutations are server actions in each area's `actions.ts`.
