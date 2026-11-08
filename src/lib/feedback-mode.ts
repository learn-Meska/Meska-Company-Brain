import "server-only";
import { getSetting } from "./scoring";
import { normalizeForm, type FeedbackFormDef } from "./feedback-form";

// Switch on the Feedback form page (settings "feedback_test" = {"always_open": true}): the QR code and the form
// work at any time, for any training day that isn't cancelled. Off: only from the start of the training day
// until 6 hours after it ends.
export async function feedbackAlwaysOpen() {
  return (await getSetting("feedback_test", { always_open: false })).always_open === true;
}

// Which training days can collect feedback (and offer the QR code).
export const takesFeedback = (status: string, alwaysOpen: boolean) => (alwaysOpen ? !["cancelled", "rejected", "declined"].includes(status) : status === "confirmed");

// The live participant form, as Training Excellence last saved it.
export async function getFeedbackForm(): Promise<FeedbackFormDef> {
  return normalizeForm(await getSetting<unknown>("feedback_form", null));
}
