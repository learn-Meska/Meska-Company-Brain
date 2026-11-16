import { CheckIcon } from "@/components/icons";

// Growth's answer for one day: a trainer is available, or not. Never who.
export function AvailabilityChip({ available }: { available: boolean }) {
  return available ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-good-bg px-3 py-1 text-xs font-semibold text-good">
      <CheckIcon size={13} /> A trainer is available
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-3 py-1 text-xs font-semibold text-warn">
      <span aria-hidden className="text-sm leading-none">!</span> No trainer is free at this time
    </span>
  );
}
