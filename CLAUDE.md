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

Meska Company Brain (package name `meska-company-brain`) is an internal app for Meska AI's Programs, Learning & Delivery team. Growth staff request multi-day trainings, booking managers assign freelance trainers who are available and match the request, trainers confirm or decline, and participants leave anonymous feedback through a QR code. That feedback feeds each trainer's score and tier.

Stack: Next.js 16 App Router (React 19, Turbopack, Tailwind v4), Supabase (Postgres, Auth, Storage), Gmail SMTP through nodemailer, deployed on Vercel.

**This Next.js version has breaking changes from what you may know.** Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `AGENTS.md`). For example, middleware is now `src/proxy.ts`, which exports `proxy`.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm run build
npm run lint         # eslint (flat config, eslint-config-next)
npx tsc --noEmit     # typecheck
npm test             # vitest: golden tests for the main flow (tests/)
npm run test:update  # rewrite the golden files after an intended change
npm run check:db     # compare the live Supabase schema with tests/schema.json
node --env-file=.env.local scripts/create-admin.mjs "Full Name" email@example.com   # create or re-link the first admin; prints a set-password link
node --env-file=.env.local scripts/import-feedback.mjs path/to/scorecard.html       # one-off import of historical feedback
```

## Golden test rules

The main flow (Growth sends a New deal → deal, participants and one booking per day are saved → trainer emailed → booking team notified) is guarded by golden tests. CI (`.github/workflows/ci.yml`) runs lint, typecheck and `npm test` on every push and pull request.

- Run `npm run lint`, `npx tsc --noEmit` and `npm test` before every commit. All must pass.
- Never edit or regenerate a file in `tests/golden/` just to make a test pass. Run `npm run test:update` only when the behaviour change is intended, review the golden diff, and say why in the commit message.
- A new database column or table goes in a new file in `supabase/migrations/` **and** in `tests/schema.json`. Then run the migration in Supabase and `npm run check:db`.
- Validation the server relies on lives in pure modules (like `src/lib/deal.ts`) so it can be tested without a database. `tests/support/fake-db.ts` stands in for `db()` in flow tests.

Env vars are listed in `.env.example`. `.env.local` is gitignored, and production values live in Vercel's project settings. `SITE_URL` must be the deployed URL in Vercel because it builds every link in emails.

## Architecture

**Data access is server-only, through the service-role client.** `src/lib/supabase.ts` exposes `authClient()`, a cookie-based client used only to find out who is signed in, and `db()`, a client using `SUPABASE_SECRET_KEY` that does every read and write. RLS does not protect anything, so every server action and route must check permissions with the `require*` helpers in `src/lib/auth.ts` before calling `db()`. Never use `db()` from client components. Every export of a `"use server"` file can be called directly from the browser with any arguments. So each export checks auth itself and rebuilds rows from known fields (never spread client objects into inserts or updates). Helpers that skip auth go in `server-only` modules under `src/lib` instead. PostgREST returns at most 1,000 rows per request, so read anything that can grow with `fetchAll()`. Guard state changes on the state you checked, e.g. `.eq("status", b.status)` followed by `.select("id")`, and treat 0 returned rows as "changed meanwhile".

**Most of the database schema is not in this repo** (changes since the New deal feature are in `supabase/migrations/`). Tables, triggers, storage buckets (`photos`, `cvs`, `materials`) and the hourly pg_cron job live in the Supabase project, which `NEXT_PUBLIC_SUPABASE_URL` points to. Inspect it with the Supabase MCP tools before changing queries. Database triggers enforce booking rules and raise errors (`slot_already_booked`, `trainer_not_available`, `time_outside_slots`), which `friendlyError()` in `src/lib/format.ts` turns into readable messages. `slotsFor()` in that file must stay in sync with the database function `slots_for()`.

**Roles and views.** Roles are `admin`, `approver` (shown as "Training Excellence"), `growth` and `trainer`, stored in `app_users.roles[]`. The highest role becomes `app_users.role`. A login can switch between the views it holds, and admins can preview any view, through the `view_as` cookie. `getCurrentUser()` resolves the active `role`, `real_role`, the available `views`, and `trainer_id` if the login is linked to a `trainers` row. Check permissions with the helpers (`canBook`, `canManageTrainers`, `canEditSettings`, `requireTrainer`, …) instead of comparing role strings. Admins and Training Excellence manage trainer profiles (`/trainers/new`, edit, scores, photo/CV, and the invitation that lets the trainer set a password); only admins delete a profile, change an invited trainer's email or link a trainer profile to a team member's login.

**Portal access.** Each portal (`approver` = Training Excellence, `growth`, `content`) has a list of accesses in `ACCESS` in the pure module `src/lib/team-access.ts` (tested in `tests/team-access.test.ts`), e.g. `te.assign`, `growth.new_deal`, `content.submit`, plus a `*.emails` access per portal. A member's ticked accesses are in `app_users.permissions[]`; portal admins (`app_users.team_admin_of[]`) have every access of their portal; company admins (`role = admin`) have everything, also while previewing a portal. Accesses only count in the portal view being used. Check them with `requireAccess(...keys)` / `can(u, key)` from `src/lib/auth.ts` (the older helpers `canBook`, `canManageTrainers`, `canEditSettings`, `canManageContent` now map to accesses). `usersWithRoles()` only returns portal members with that portal's Get emails access. `homeFor()` lands each login on the first page it can open, or `/no-access`. Company admins set portals, portal admins and accesses in Team & access; a portal admin does the same for their own portal on **My team** (`/team`, actions in `src/app/(app)/team/actions.ts`), but can't touch company admins, other portals or their own access. Migrations `20261108090000_team_admins.sql` and `20261108100000_portal_access.sql`. Invite helpers are in the `server-only` module `src/lib/team-invite.ts`. Adding a category to someone who already has a login (yourself included) never grants it directly: `sendAccessInvite()` (`src/lib/access-invite.ts`) stores an `access_invites` row and emails a link to `/accept-access`, where the signed-in person confirms (`acceptAccess`; rules in `inviteProblem()`: once, 7 days, only for that account). Brand-new emails still get the set-your-password invite.

**Auth.** `src/proxy.ts` redirects to `/login` for any path not listed in `PUBLIC`. The public paths are `/login`, `/forgot-password`, `/auth/*`, `/api/cron/*`, and `/f/*`, the participant feedback form. Invites and password resets avoid Supabase's own emails: `accessLink()` in `src/lib/access-link.ts` generates a token link to `/auth/confirm`. That page uses up the one-time token only when the user presses Continue (the `confirmLink` action), so mail scanners that prefetch links can't burn it, then sends them to `/auth/set-password`. `accessLink` must never be exported from a `"use server"` file, because it signs anyone in. The `next` parameter after sign-in goes through `safeNext()`.

**Booking lifecycle.** The labels are in `STATUS_LABEL`, and the logic is in `src/app/(app)/bookings/actions.ts`:
`needs_trainer` (Growth's `createRequest`; a multi-day request shares one `batch_id` with one row per day) → `awaiting_trainer` (a manager's `assignTrainer`) → `confirmed`, or back to `needs_trainer` if the trainer declines in `respondBooking`. Bookings can also become `cancelled`. Free slots come from `availability` rows minus `booking_locks`; see `searchTrainers()` in `src/lib/search.ts`. A day has two slots: morning (9 AM–5 PM) and evening (6 PM–11 PM).

**New deal (`/request`).** Four steps: client & program (company name, program name, industry, client contact), audience (a participant CSV with name, title, department; the template is `PARTICIPANTS_TEMPLATE_CSV`), proposal & value (a file in the private `proposals` bucket, value per training day and number of days; total = value × days), and training days. `createRequest` saves one `deals` row, its `deal_participants`, then the bookings with `deal_id`, and deletes the deal again if a later step fails. Trainer matching for a New deal uses the industry only (no audience level or function). Deal data is shown only to the Meska team on `/bookings/[id]` (`DealCard`); never put it in the trainer's ticket, emails or `/me` pages.

**Content team.** A fifth role, `content` (shown as "Content"), is created by an admin in Team & access like any other and gets the same invite and set-your-password email. Its home is `/content`: every deal Growth sends appears there (`createRequest` notifies everyone with the role), and `/content/[dealId]` shows the audience (participants), the proposal (never the deal value) and the training days. The team writes a guide and uploads files (`deals.content_guide`, `deal_content` rows in the `materials` bucket under `deals/<dealId>/`), then `submitContent` stamps `deals.content_submitted_at` and notifies the assigned trainers and the booking team. Trainers see the guide and files on the ticket only after that (`getDealInfo().content`, `contentLink` checks the trainer is assigned to the deal and the content is submitted). The `user_role` enum needs `content` (migration `20261102090000_content_team.sql`).

**Dashboard (`/dashboard`).** The home page of Training Excellence (`approver`); admins can open it too. A table with one row per training, grouped by deal, then batch, then single booking: date, company, training, industry, Growth lead, trainer, trainer confirmation, content, training status and feedback score (NPS). It replaces All bookings and Request a training in the nav for Training Excellence and admins (the routes stay; Growth keeps both). The rules (`cycleStage`, `confirmationLabel`, `contentState`, `needsAttention`) live in the pure module `src/lib/cycle.ts` and are tested in `tests/cycle.test.ts`. `/dashboard/[id]` shows one training across its days: delivery reports, content, the deal card, and `reassignTraining` / `cancelTraining`, which act on every remaining day. A trainer marks a day as delivered (`submitBrief`, which sets `finished_at`) only with a brief and audio; a training is Delivered once every live day is. Audio is a `brief` row in `booking_materials` with an `audio-` stored name (`isAudioPath`), because that table's check constraint only allows two kinds.

**Compensation.** Manual for now: nothing is calculated from bookings, tiers or scores, and amounts stay what was typed. The Training list follows the chosen trainer and offers only their assigned days (`isAssignedTo`, checked again on the server); the line's name and date are copied from that booking. Training Excellence and admins add, edit and delete lines on `/compensation` (`compensation_lines`, rules in the pure module `src/lib/compensation.ts`); trainers see only their own, read-only, on `/me/compensation`. The status (Pending, Approved, Paid) and payment date are typed too. Never show these amounts to Growth, Content or other trainers.

**Time rules (Cairo time, `src/lib/format.ts`).** Trainers see the program name once assigned (`programVisible` now always returns true; it used to hide the name until 48 hours before). Trainers also see the company, participant count by department and every training day of the deal (`getDealInfo`), never the value, proposal or participant names. Anything shown or emailed to a trainer must go through `programVisible`, `trainerTitle` and `bookingRows(b, forTrainer=true)`. The participant feedback form is open from the session start until 6 hours after it ends (`feedbackWindow`).

**Side effects.** Every state change calls `audit()`, which writes to `audit_log` (labels in `AUDIT_LABEL`), and `notify()` in `src/lib/notify.ts`. `notify()` creates an in-app notification for recipients who have an account, shown by the bell, and optionally sends an email. Trainers who haven't accepted their invite get email only. Every change to a training (assigned, confirmed, declined, edited, client contact, reassigned, cancelled, content submitted, delivered) goes by bell and email to everyone on it through `trainingTeam()` in `src/lib/team.ts`: admins, Training Excellence, the Growth requester and, for a New deal, the content team, minus whoever made the change. The trainer gets a separate copy without the deal or the cancellation reason. Cancelling several days sends the team one message. `sendEmail()` first writes every message to `email_outbox`. Without Gmail credentials the message stays `queued` and nothing is sent. Messages Gmail rejects are marked `failed`. Both scheduled jobs call `retryFailedEmails()`, which re-sends the email only (up to 3 attempts within 2 days), so jobs never re-send bell notifications. All emails use `emailLayout()`. The profile PDF fonts are Latin-only, so text goes through `pdfText()`, and saving a profile warns when some characters can't be printed.

**Scoring.** `src/lib/scoring.ts` builds `TrainerProfile`s by combining weighted `score_categories` (entered by hand, or taken from feedback), participant feedback, `score_override` and `tiers`. Admins and booking managers configure these in `/admin/settings`. Values tunable at runtime are read through `getSetting(key, fallback)` from the `settings` table.

**Scheduled jobs.** Both are protected by `Authorization: Bearer $CRON_SECRET`.
- `/api/cron/reminders` runs daily from `vercel.json`. It reminds trainers who haven't confirmed after `settings.trainer_response.hours`, and sends availability reminders.
- `/api/cron/feedback` runs hourly from Supabase pg_cron. It emails each trainer their feedback summary once the form closes.

**Files.** Uploads go straight from the browser to Supabase Storage through one-time signed upload URLs (`create*Upload` → `record*`/`save*` server actions), so they skip Vercel's body-size limit. The trainer bio PDF (`/trainers/[id]/bio`, built with `@react-pdf/renderer`) reads its fonts from `src/fonts` at runtime, which `next.config.ts` traces into the build.

**Routes.** `src/app/(app)` holds the signed-in pages, sharing a layout with the nav and bell. `src/app/(auth)` holds the login and forgot-password pages. Pages use server components, and mutations are server actions in each area's `actions.ts`.
