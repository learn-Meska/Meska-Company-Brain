import type { ContentState, Stage } from "@/lib/cycle";

export const STAGE_STYLE: Record<Stage, string> = {
  needs_trainer: "bg-[#FDE2EC] text-[#B4235A]",
  waiting_trainer: "bg-[#E2EBFE] text-royal",
  scheduled: "bg-ice text-royal-deep",
  in_delivery: "bg-[#E2EBFE] text-royal",
  report_due: "bg-warn-bg text-warn",
  delivered: "bg-good-bg text-good",
  cancelled: "bg-surface2 text-muted line-through",
};
export const CONTENT_STYLE: Record<Exclude<ContentState, "none">, string> = { needs_content: "bg-warn-bg text-warn", in_progress: "bg-[#E2EBFE] text-royal", submitted: "bg-good-bg text-good" };
