import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { requestReset } from "@/app/auth/actions";

export default function ForgotPage() {
  return (
    <>
      <h1 className="h2 mb-1">Reset password</h1>
      <p className="mb-5 text-sm text-muted">We&apos;ll email you a link to choose a new password.</p>
      <Form action={requestReset} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <Submit className="btn w-full" pending="Sending…">Send reset link</Submit>
      </Form>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-blue hover:underline">Back to sign in</Link>
      </p>
    </>
  );
}
