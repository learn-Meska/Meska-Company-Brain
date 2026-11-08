// A file's type as a small document tile (Word blue, PDF red, PowerPoint orange, anything else neutral).
export function FileBadge({ name, small = false }: { name: string; small?: boolean }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const [label, tone] =
    ext === "pdf"
      ? ["PDF", "text-ds-danger"]
      : ext === "doc" || ext === "docx"
        ? ["DOC", "text-ds-primary"]
        : ext === "ppt" || ext === "pptx"
          ? ["PPT", "text-[#C2410C]"]
          : ext === "xls" || ext === "xlsx" || ext === "csv"
            ? ["XLS", "text-[#15803D]"]
            : [ext.slice(0, 4).toUpperCase() || "FILE", "text-ds-text"];
  return (
    <span className={`relative grid flex-none place-items-end rounded-md border border-ds-primary/15 bg-ds-primary-soft ${small ? "h-10 w-8 pb-1" : "h-12 w-10 pb-1.5"}`}>
      <span aria-hidden className="absolute right-0 top-0 h-3 w-3 rounded-bl-[4px] border-b border-l border-ds-primary/15 bg-ds-surface" />
      <span className={`w-full text-center font-bold tracking-wide ${small ? "text-[9px]" : "text-[10px]"} ${tone}`}>{label}</span>
    </span>
  );
}
