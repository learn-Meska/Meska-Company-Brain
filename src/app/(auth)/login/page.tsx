import Link from "next/link";
import { Form, Submit } from "@/components/form";
import { signIn } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, expired } = await searchParams;
  return (
    <>
      <h1 className="h2 mb-1">Sign in</h1>
      <p className="mb-5 text-sm text-muted">Use the email your invitation was sent to.</p>
      {expired && (
        <p className="mb-4 rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">
          That link has expired or was already used. <Link href="/forgot-password" className="font-semibold underline">Request a new one</Link> to set your password.
        </p>
      )}
      <Form action={signIn} className="space-y-3">
        <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <Submit className="btn w-full" pending="Signing in…">Sign in</Submit>
      </Form>
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-blue hover:underline">Forgot your password?</Link>
      </p>
    </>
  );
}
