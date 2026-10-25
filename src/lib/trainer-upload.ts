"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createTrainerFileUpload, saveTrainerFile } from "@/app/(app)/admin/actions";

export const PHOTO_TYPES = ["image/jpeg", "image/png"];
export const CV_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export function checkTrainerFile(kind: "photo" | "cv", file: File) {
  if (kind === "photo" && !PHOTO_TYPES.includes(file.type)) return "Use a JPG or PNG photo.";
  if (kind === "photo" && file.size > 5 * 1024 * 1024) return "The photo must be under 5 MB.";
  if (kind === "cv" && !CV_TYPES.includes(file.type)) return "Upload the CV as a PDF or Word file.";
  if (kind === "cv" && file.size > 10 * 1024 * 1024) return "The CV must be under 10 MB.";
  return null;
}

// Signed upload straight to storage, then record it on the trainer.
export async function uploadTrainerFile(trainerId: string, kind: "photo" | "cv", file: File): Promise<{ error?: string; ok?: string }> {
  const bad = checkTrainerFile(kind, file);
  if (bad) return { error: bad };
  const u = await createTrainerFileUpload(trainerId, kind, file.name);
  if ("error" in u && u.error) return { error: u.error };
  const { path, token } = u as { path: string; token: string };
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { error } = await sb.storage.from(kind === "photo" ? "photos" : "cvs").uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error) return { error: error.message };
  return saveTrainerFile(trainerId, kind, path, file.name);
}
