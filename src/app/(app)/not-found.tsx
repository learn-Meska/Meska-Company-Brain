import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-lg text-center">
      <h1 className="h2 mb-2">Not found</h1>
      <p className="mb-5 text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="btn">Go to home</Link>
    </div>
  );
}
