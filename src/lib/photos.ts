import "server-only";
import { db } from "./supabase";

// Short-lived link to a private trainer photo.
export async function photoUrl(path: string | null | undefined, seconds = 3600) {
  if (!path) return null;
  const { data } = await db().storage.from("photos").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function photoBytes(path: string | null | undefined) {
  if (!path) return null;
  const { data } = await db().storage.from("photos").download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}
