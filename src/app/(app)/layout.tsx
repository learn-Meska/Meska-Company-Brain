import { Bell } from "@/components/bell";
import { Nav, type NavItem } from "@/components/nav";
import { can, canEditSettings, requireUser, ROLE_LABEL } from "@/lib/auth";
import { setViewAs, signOut } from "@/app/auth/actions";
import { ViewSwitcher } from "@/components/view-switcher";
import { dealScope, leaderTeam, ledTeam } from "@/lib/team-access";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const items: NavItem[] = [];
  const has = (k: string) => can(u, k);
  if (u.role !== "trainer") {
    if (has("te.dashboard")) items.push({ href: "/dashboard", label: "Dashboard" });
    if (has("te.compensation")) items.push({ href: "/compensation", label: "Compensation" });
    // Training Excellence and admins follow every training on the dashboard; Growth sends deals and has its own list.
    if (u.role === "growth" && has("growth.new_deal")) items.push({ href: "/request", label: "New deal" });
    if (u.role === "approver" && has("te.assign") && !has("te.dashboard")) items.push({ href: "/request", label: "Request a training" });
    if (has("te.find")) items.push({ href: "/find", label: "Find a trainer" });
    if (has("te.find") || has("te.dashboard") || has("growth.calendar")) items.push({ href: "/calendar", label: "Calendar" });
    if (u.role === "growth") items.push({ href: "/bookings", label: { all: "All bookings", team: "Team bookings", own: "My bookings" }[dealScope(u)] });
    if (has("growth.trainers") || has("te.trainers") || has("te.find") || has("te.assign")) items.push({ href: "/trainers", label: "Trainers" });
    if (has("content.view")) items.push({ href: "/content", label: "Content requests" });
    if (canEditSettings(u)) items.push({ href: "/admin/feedback-form", label: "Feedback form" });
    if (u.role === "admin") items.push({ href: "/admin/settings", label: "Scoring & lists" }, { href: "/admin/users", label: "Team & access" }, { href: "/admin/feedback", label: "Feedback import" }, { href: "/admin/logs", label: "Activity log" });
    else if (canEditSettings(u)) items.push({ href: "/admin/settings", label: "Scoring & lists" });
  }
  // Portal admins manage the people in the portal they're working in; team leaders see their members.
  if (ledTeam(u) || leaderTeam(u)) items.push({ href: "/team", label: "My team" });
  // Staff who also deliver trainings (e.g. the L&D director) get the trainer pages too.
  if (u.trainer_id && (u.role === u.real_role || u.role === "trainer")) {
    const p = u.role === "trainer" ? "My" : "My trainer";
    items.push({ href: "/me", label: `${p} profile` }, { href: "/me/calendar", label: "My calendar" }, { href: "/me/availability", label: "My availability" }, { href: "/me/bookings", label: "My trainings" }, { href: "/me/compensation", label: "My compensation" });
  }
  const roleLabel = ROLE_LABEL[u.role];
  const canSwitch = u.views.length > 1;
  const switchLabel = u.real_role === "admin" ? "View as" : "Switch access";
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="brand-gradient relative flex h-14 items-center justify-between px-4 lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:items-stretch lg:justify-start lg:gap-6 lg:px-4 lg:py-6">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-white-text.png" alt="Meska AI" className="h-7 w-auto lg:h-8" />
          <div className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.25em] text-[#93C5FD] lg:block">Company Brain</div>
        </div>
        <Nav items={items} />
        {canSwitch && (
          <div className="hidden shrink-0 lg:block">
            <ViewSwitcher current={u.role} views={u.views} label={switchLabel} />
          </div>
        )}
        <div className="hidden shrink-0 text-xs text-[#C7D7F5] lg:block">
          <div className="font-medium text-white">{u.full_name}</div>
          <div className="truncate">{u.email}</div>
          <div className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5">{roleLabel}</div>
          <form action={signOut} className="mt-3">
            <button className="text-[#93C5FD] hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        {u.real_role === "admin" && u.role !== "admin" && (
          <div className="flex flex-wrap items-center justify-center gap-3 bg-warn-bg px-4 py-2 text-sm text-warn">
            <span>
              You&apos;re previewing the <b>{ROLE_LABEL[u.role]}</b> view. Actions you take here are real.
            </span>
            <form action={setViewAs}>
              <input type="hidden" name="view" value="admin" />
              <button className="rounded-full bg-warn px-3 py-0.5 text-xs font-semibold text-white hover:brightness-110">Back to Admin view</button>
            </form>
          </div>
        )}
        <header className="sticky top-0 z-20 flex items-center justify-end gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:px-8">
          {canSwitch && (
            <div className="w-44 lg:hidden">
              <ViewSwitcher current={u.role} views={u.views} label={switchLabel} id="view_as_mobile" />
            </div>
          )}
          <span className="text-sm text-muted lg:hidden">{u.full_name}</span>
          <Bell />
          <form action={signOut} className="lg:hidden">
            <button className="text-xs text-blue">Sign out</button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{children}</main>
        <footer className="pb-8 text-center text-xs text-faint">© 2026 Meska AI — Confidential</footer>
      </div>
    </div>
  );
}
