"use client";

import type { ComponentProps } from "react";

// A filter dropdown that applies as soon as a value is picked (submits its GET form).
export function AutoSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
