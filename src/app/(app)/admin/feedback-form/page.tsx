import { PageHeader } from "@/components/page-header";
import { AlwaysOpenSwitch, FeedbackFormEditor } from "@/components/feedback-form-editor";
import { requireSettingsEditor } from "@/lib/auth";
import { feedbackAlwaysOpen, getFeedbackForm } from "@/lib/feedback-mode";

// Company admins and Training Excellence: when the feedback QR code works, and what the form asks.
export default async function FeedbackFormPage() {
  await requireSettingsEditor();
  const [alwaysOpen, form] = await Promise.all([feedbackAlwaysOpen(), getFeedbackForm()]);
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Training Excellence"
        title="Feedback form"
        lead="What participants see when they scan a training's QR code. Changes are live for every QR code as soon as you save; answers already sent keep their original questions."
      />
      <AlwaysOpenSwitch initial={alwaysOpen} />
      <FeedbackFormEditor initial={form.questions} />
    </div>
  );
}
