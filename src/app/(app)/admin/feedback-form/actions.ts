"use server";

import { revalidatePath } from "next/cache";
import { requireSettingsEditor } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { audit } from "@/lib/notify";
import { DEFAULT_FORM, formError, normalizeForm } from "@/lib/feedback-form";

function refresh() {
  revalidatePath("/admin/feedback-form");
  revalidatePath("/f", "layout");
}

// Company admins and Training Excellence (Scoring & lists): QR code and form open only on the training day, or any time.
export async function setFeedbackAlwaysOpen(on: boolean) {
  const me = await requireSettingsEditor();
  const { error } = await db().from("settings").upsert({ key: "feedback_test", value: { always_open: on === true } });
  if (error) return { error: "Couldn't save. Please try again." };
  await audit(me.id, "feedback_settings_changed", null, { always_open: on === true });
  refresh();
  return { ok: on ? "The QR code and form now work any time." : "The QR code and form now work only on the training day." };
}

// Publishes the participant form. Every QR code opens the live form, so it changes everywhere at once.
export async function saveFeedbackForm(raw: unknown) {
  const me = await requireSettingsEditor();
  const bad = formError(raw);
  if (bad) return { error: bad };
  const form = normalizeForm(raw);
  const { error } = await db().from("settings").upsert({ key: "feedback_form", value: form });
  if (error) return { error: "Couldn't save. Please try again." };
  await audit(me.id, "feedback_settings_changed", null, { questions: form.questions.length });
  refresh();
  return { ok: "Saved. Every feedback QR code now opens this form.", form };
}

export async function resetFeedbackForm() {
  const me = await requireSettingsEditor();
  const { error } = await db().from("settings").upsert({ key: "feedback_form", value: DEFAULT_FORM });
  if (error) return { error: "Couldn't reset. Please try again." };
  await audit(me.id, "feedback_settings_changed", null, { reset: true });
  refresh();
  return { ok: "The original form is back.", form: DEFAULT_FORM };
}
