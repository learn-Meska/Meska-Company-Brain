import Link from "next/link";
import { CONTENT_STYLE, STAGE_STYLE } from "@/app/(app)/dashboard/styles";
import { CONTENT_LABEL, STAGE_LABEL, type Training } from "@/lib/cycle";
import { fmtDate, fmtTime } from "@/lib/format";
import { fmtNps } from "@/lib/survey";

const confirmStyle = (label: string) => (label === "Confirmed" ? "bg-good-bg text-good" : label === "Declined" ? "bg-bad-bg text-bad" : label === "No trainer yet" ? "bg-[#FDE2EC] text-[#B4235A]" : label === "—" ? "bg-surface2 text-muted" : "bg-[#E2EBFE] text-royal");

// One training on the Training Excellence dashboard and the Growth bookings list.
export function TrainingRow({ t, href, showLead = true }: { t: Training; href: string; showLead?: boolean }) {
  const dayCount = t.live || t.days.length;
  return (
    <tr>
      <td className="whitespace-nowrap">
        {fmtDate(t.firstDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        <div className="text-xs text-muted">{dayCount > 1 ? `Until ${fmtDate(t.lastDate, { day: "numeric", month: "short", year: "numeric" })}` : `${fmtTime(t.firstDay.start_time)} – ${fmtTime(t.firstDay.end_time)}`}</div>
      </td>
      <td className="text-sm">{t.company ?? <span className="text-muted">—</span>}</td>
      <td>
        <Link href={href} className="font-medium text-blue hover:underline">{t.program}</Link>
        <div className="text-xs text-muted">{dayCount} {dayCount === 1 ? "day" : "days"}</div>
      </td>
      <td className="text-xs text-muted">{t.industry ?? "—"}</td>
      {showLead && <td className="text-sm">{t.requestedByName ?? "—"}</td>}
      <td className="text-sm">{t.trainers.length ? t.trainers.map((x) => x.name).join(", ") : <span className="text-[#B4235A]">Not assigned</span>}</td>
      <td><span className={`badge whitespace-nowrap ${confirmStyle(t.confirmation)}`}>{t.confirmation}</span></td>
      <td>{t.content === "none" ? <span className="text-muted">—</span> : <span className={`badge whitespace-nowrap ${CONTENT_STYLE[t.content]}`}>{CONTENT_LABEL[t.content]}</span>}</td>
      <td>
        <span className={`badge whitespace-nowrap ${STAGE_STYLE[t.stage]}`}>{STAGE_LABEL[t.stage]}</span>
        {t.attention && <div className="mt-1"><span className="badge whitespace-nowrap bg-bad-bg text-bad">Needs attention</span></div>}
        {t.started && t.live > 0 && <div className="mt-1 whitespace-nowrap text-xs text-muted">Brief {t.briefs}/{t.live} · Audio {t.audios}/{t.live}</div>}
      </td>
      <td className="text-sm">
        {t.responses ? <><b className="tabular-nums">{fmtNps(t.score)}</b><div className="whitespace-nowrap text-xs text-muted">{t.responses} {t.responses === 1 ? "response" : "responses"}</div></> : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}
