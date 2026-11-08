"use client";

import { Form, type ActionResult } from "@/components/form";

export function DeleteTrainer({ action, id, name }: { action: (fd: FormData) => Promise<ActionResult>; id: string; name: string }) {
  return (
    <Form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn-quiet text-bad"
        onClick={(e) => {
          if (!window.confirm(`Delete ${name}'s profile? This can't be undone.`)) e.preventDefault();
        }}
      >
        Delete trainer
      </button>
    </Form>
  );
}
