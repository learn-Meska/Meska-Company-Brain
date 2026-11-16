import "server-only";
import { getSetting } from "./scoring";
import { normalizeForm, type FeedbackFormDef } from "./feedback-form";

// Switch on the Feedback form page (settings "feedback_test" = {"always_open": true}): the QR code and the form
// work at any time for a confirmed training day. Off: only from the start of the training day until 6 hours after it ends.
export async function feedbackAlwaysOpen() {
  return (await getSetting("feedback_test", { always_open: false })).always_open === true;
}

// Which training days can collect feedback (and offer the QR code): only once the trainer confirmed the day.
// The switch only lifts the time window, never this.
export const takesFeedback = (status: string) => status === "confirmed";

// The live participant form, as Training Excellence last saved it.
export async function getFeedbackForm(): Promise<FeedbackFormDef> {
  return normalizeForm(await getSetting<unknown>("feedback_form", null));
}

// Test switch on the Feedback form page (settings "delivery_test" = {"any_time": true}): a trainer can mark a
// confirmed day as delivered before its session starts. Off: only from the start of the session.
export async function deliveryAnyTime() {
  return (await getSetting("delivery_test", { any_time: false })).any_time === true;
}
