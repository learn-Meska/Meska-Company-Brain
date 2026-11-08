import type { Summary } from "@/lib/feedback";
import { fmtNps } from "@/lib/survey";

// Everything participants answered for one training day: the NPS, then each question of the form.
export function FeedbackResults({ fb }: { fb: Summary }) {
  return (
    <div className="space-y-4">
      <div className="stat-hot rounded-xl p-4 text-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold tabular-nums">{fmtNps(fb.nps)}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-[#93C5FD]">NPS (−100 to 100)</div>
          </div>
          <div className="text-xs text-[#C7D7F5]">
            {fb.promoters} promoters · {fb.passives} passives · {fb.detractors} detractors
          </div>
        </div>
      </div>
      {fb.questions.map((q) => (
        <div key={`${q.id}:${q.type}`} className="rounded-xl border border-ds-border bg-ds-surface p-4">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-medium text-ds-heading">{q.label}</p>
            <span className="text-xs text-ds-text">{q.answered} {q.answered === 1 ? "answer" : "answers"}</span>
          </div>
          {q.type === "yes_no" && (
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 rounded-full bg-ds-subtle">
                <div className="h-2.5 rounded-full bg-ds-primary" style={{ width: `${q.yesPercent ?? 0}%` }} />
              </div>
              <span className="w-20 text-right text-sm font-semibold tabular-nums text-ds-heading">{q.yesPercent != null ? `${q.yesPercent}% yes` : "—"}</span>
            </div>
          )}
          {q.type === "rating" && (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-2xl font-semibold tabular-nums text-ds-heading">
                {q.average ?? "—"}
                <span className="text-sm font-normal text-ds-text"> / 5</span>
              </span>
              <div className="flex items-end gap-1.5">
                {(q.ratings ?? []).map((n, i) => {
                  const top = Math.max(1, ...(q.ratings ?? []));
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="flex h-10 w-6 items-end rounded bg-ds-subtle">
                        <div className="w-6 rounded bg-ds-primary" style={{ height: `${(n / top) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-ds-text">{i + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {q.type === "choice" && (
            <ul className="space-y-1.5">
              {(q.choices ?? []).map((c) => (
                <li key={c.option} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate text-ds-heading" title={c.option}>{c.option}</span>
                  <div className="h-2 flex-1 rounded-full bg-ds-subtle">
                    <div className="h-2 rounded-full bg-ds-primary" style={{ width: `${q.answered ? (c.count / q.answered) * 100 : 0}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-ds-text">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
          {q.type === "text" &&
            ((q.texts ?? []).length ? (
              <ul className="space-y-1.5">
                {(q.texts ?? []).map((t, i) => (
                  <li key={i} className="whitespace-pre-wrap rounded-lg bg-ds-subtle/60 px-3 py-2 text-sm text-ds-heading">“{t}”</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ds-text">No answers.</p>
            ))}
        </div>
      ))}
    </div>
  );
}
