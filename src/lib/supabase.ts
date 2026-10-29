import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Session-aware client: only used to identify who is signed in.
export async function authClient() {
  const store = await cookies();
  return createServerClient(url, publishable, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component; the proxy refreshes the session instead
        }
      },
    },
  });
}

// PostgREST returns at most 1,000 rows per request; this pages through until everything is read.
// `page` must build the same ordered query each time and apply .range(from, to).
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, max = 100_000) {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: rows, error };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < size) break;
  }
  return { data: rows, error: null };
}

// Service client: all data access goes through the server with this, after role checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are typed where they are read
let admin: SupabaseClient<any, "public", any> | null = null;
export function db() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is missing from .env.local");
  }
  admin ??= createClient(url, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
