"use client";

import Link from "next/link";
import { useEffect } from "react";

// Any page that fails to load shows this inside the app shell instead of a blank error screen.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-lg text-center">
      <h1 className="h2 mb-2">Something went wrong</h1>
      <p className="mb-5 text-sm text-muted">This page couldn&apos;t be loaded. Try again, and if it keeps happening, let the admin know.</p>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn" onClick={() => retry()}>Try again</button>
        <Link href="/" className="btn-ghost">Go to home</Link>
      </div>
    </div>
  );
}
