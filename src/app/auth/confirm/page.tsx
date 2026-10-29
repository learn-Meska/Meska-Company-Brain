import { redirect } from "next/navigation";
import { Form, Submit } from "@/components/form";
import { confirmLink } from "@/app/auth/actions";
import AuthLayout from "@/app/(auth)/layout";

// The emailed invite/reset link lands here. The one-time token is only used when the person presses
// the button, so mail scanners that open links ahead of the user don't use it up.
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash, type } = await searchParams;
  if (typeof token_hash !== "string" || (type !== "invite" && type !== "recovery")) redirect("/login?expired=1");
  return (
    <AuthLayout>
      <h1 className="h2 mb-1">{type === "invite" ? "Accept your invitation" : "Reset your password"}</h1>
      <p className="mb-5 text-sm text-muted">Continue to choose your password.</p>
      <Form action={confirmLink} className="space-y-3">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <Submit className="btn w-full" pending="Checking the link…">Continue</Submit>
      </Form>
    </AuthLayout>
  );
}
