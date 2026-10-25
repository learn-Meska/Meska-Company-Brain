import { STATUS_LABEL } from "@/lib/format";

const STYLE: Record<string, string> = {
  needs_trainer: "bg-[#FDE2EC] text-[#B4235A]",
  pending_approval: "bg-warn-bg text-warn",
  awaiting_trainer: "bg-[#E2EBFE] text-royal",
  confirmed: "bg-good-bg text-good",
  rejected: "bg-bad-bg text-bad",
  declined: "bg-bad-bg text-bad",
  cancelled: "bg-surface2 text-muted line-through",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STYLE[status] ?? "bg-surface2"}`}>{STATUS_LABEL[status] ?? status}</span>;
}
