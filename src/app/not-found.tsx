import Link from "next/link";
import AuthLayout from "@/app/(auth)/layout";

export default function NotFound() {
  return (
    <AuthLayout>
      <h1 className="h2 mb-2">Not found</h1>
      <p className="mb-5 text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="btn w-full">Go to home</Link>
    </AuthLayout>
  );
}
