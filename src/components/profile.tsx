import { initials } from "@/lib/format";
import type { TrainerProfile } from "@/lib/scoring";

export function TierBadge({ tier }: { tier: TrainerProfile["tier"] }) {
  if (!tier) return <span className="badge bg-surface2 text-muted">No tier</span>;
  return (
    <span className="badge text-white" style={{ background: tier.color }}>
      {tier.name}
    </span>
  );
}

export function ScoreBar({ value }: { value: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
      <div className="h-full rounded-full bg-gradient-to-r from-royal to-blue" style={{ width: `${Math.min(100, value ?? 0)}%` }} />
    </div>
  );
}

const KIND_LABEL = { audience: "Audience levels", function: "Functions", industry: "Industries" } as const;

// Trainers don't see their own tier for now (showTier=false on "My profile").
export function ProfileView({ t, showContact = true, showTier = true }: { t: TrainerProfile; showContact?: boolean; showTier?: boolean }) {
  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-16 flex-none place-items-center rounded-2xl bg-gradient-to-br from-blue to-navy text-xl font-semibold text-white">{initials(t.full_name)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="h1">{t.full_name}</h1>
              {showTier && <TierBadge tier={t.tier} />}
              {!t.active && <span className="badge bg-bad-bg text-bad">Inactive</span>}
            </div>
            {showContact && (
              <div className="mt-0.5 text-sm text-muted">
                {[t.email, t.phone].filter(Boolean).join(" · ") || "No contact details yet"}
              </div>
            )}
          </div>
        </div>
        {t.bio && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-ink">{t.bio}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="stat-hot rounded-xl p-3 text-white">
            <div className="text-2xl font-semibold tabular-nums">{t.total}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-[#93C5FD]">Total score / 100{t.score_override != null && " · set by admin"}</div>
          </div>
          <div className="rounded-xl border border-ice2 bg-ice p-3">
            <div className="text-2xl font-bold tabular-nums text-royal-deep">{t.feedback.average != null ? t.feedback.average.toFixed(2) : "—"}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-[#3B82F6]">Overall feedback / 5</div>
          </div>
          <div className="rounded-xl border border-ice2 bg-ice p-3">
            <div className="text-2xl font-bold tabular-nums text-royal-deep">{t.delivered}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-[#3B82F6]">Trainings delivered</div>
          </div>
          <div className="rounded-xl border border-ice2 bg-ice p-3">
            <div className="text-2xl font-bold tabular-nums text-royal-deep">{t.feedback.responses}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-[#3B82F6]">Feedback responses</div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {t.skills.length ? t.skills.map((s) => <span key={s.id} className="chip">{s.name}</span>) : <span className="text-sm text-muted">No skills yet.</span>}
          </div>
          {(["audience", "function", "industry"] as const).map((k) => {
            const items = t.lookups.filter((l) => l.kind === k);
            return (
              <div key={k} className="mt-4">
                <div className="label">{KIND_LABEL[k]}</div>
                <div className="flex flex-wrap gap-1.5">
                  {items.length ? items.map((l) => <span key={l.id} className="chip bg-surface2">{l.name}</span>) : <span className="text-xs text-faint">None</span>}
                </div>
              </div>
            );
          })}
        </section>

        <section className="card">
          <h2 className="h2 mb-3">Score breakdown</h2>
          <div className="space-y-3">
            {t.categories.map((c) => (
              <div key={c.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>
                    {c.name} <span className="text-xs text-faint">· weight {c.weight}%</span>
                  </span>
                  <b className="tabular-nums">{c.score != null ? c.score : <span className="font-normal text-faint">no data</span>}</b>
                </div>
                <ScoreBar value={c.score} />
              </div>
            ))}
          </div>
        </section>
      </div>
      {(t.feedback.liked.length > 0 || t.feedback.improve.length > 0) && (
        <section className="card">
          <h2 className="h2 mb-3">What participants say</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["Positive", t.feedback.liked, "bg-good-bg text-good"],
                ["To improve", t.feedback.improve, "bg-warn-bg text-warn"],
              ] as const
            ).map(([label, list, tone]) => (
              <div key={label}>
                <div className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</div>
                {list.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {list.map((c, i) => (
                      <li key={i} className="rounded-lg bg-surface2 px-3 py-2">“{c}”</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-faint">No comments yet.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
