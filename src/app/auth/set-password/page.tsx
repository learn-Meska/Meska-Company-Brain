import { redirect } from "next/navigation";
import { Form, Submit } from "@/components/form";
import { setPassword } from "@/app/auth/actions";
import { getCurrentUser, signedInFromEmailLink } from "@/lib/auth";
import AuthLayout from "@/app/(auth)/layout";

export default async function SetPasswordPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  // Coming from an invite/reset email proves who they are; otherwise ask for the current password.
  const fromLink = await signedInFromEmailLink();
  return (
    <AuthLayout>
      <h1 className="h2 mb-1">{fromLink ? `Welcome, ${u.full_name.split(" ")[0]}` : "Change your password"}</h1>
      <p className="mb-5 text-sm text-muted">Choose a password for {u.email}.</p>
      <Form action={setPassword} className="space-y-3">
        {!fromLink && (
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
            <p className="mt-1 text-xs text-muted">
              Never set one, or forgot it? <a href="/forgot-password" className="text-blue hover:underline">Get a new link by email</a> instead.
            </p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" className="input" />
        </div>
        <Submit className="btn w-full">Save password</Submit>
      </Form>
    </AuthLayout>
  );
}
