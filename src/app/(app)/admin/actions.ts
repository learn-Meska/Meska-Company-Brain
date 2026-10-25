"use server";

import { revalidatePath } from "next/cache";
import { mainRole, requireRole, requireSettingsEditor, requireTrainerManager } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { emailLayout, sendEmail } from "@/lib/email";
import { accessLink } from "@/app/auth/actions";
import { audit } from "@/lib/notify";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

function done(path: string, ok = "Saved.") {
  revalidatePath(path);
  return { ok };
}

/* ---------- Skills & lists ---------- */

export async function addSkill(fd: FormData) {
  await requireSettingsEditor();
  const name = str(fd, "name");
  if (!name) return { error: "Enter a skill name." };
  const { error } = await db().from("skills").insert({ name });
  if (error) return { error: error.code === "23505" ? "That skill already exists." : error.message };
  return done("/admin/settings", `Added “${name}”.`);
}

export async function deleteSkill(fd: FormData) {
  await requireSettingsEditor();
  await db().from("skills").delete().eq("id", str(fd, "id"));
  revalidatePath("/admin/settings");
}

export async function addLookup(fd: FormData) {
  await requireSettingsEditor();
  const name = str(fd, "name");
  const kind = str(fd, "kind");
  if (!name) return { error: "Enter a name." };
  const { data: last } = await db().from("lookups").select("sort").eq("kind", kind).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db().from("lookups").insert({ kind, name, sort: ((last as { sort: number } | null)?.sort ?? 0) + 1 });
  if (error) return { error: error.code === "23505" ? "That one already exists." : error.message };
  return done("/admin/settings", `Added “${name}”.`);
}

export async function deleteLookup(fd: FormData) {
  await requireSettingsEditor();
  const { error } = await db().from("lookups").delete().eq("id", str(fd, "id"));
  if (error) return { error: "It's used by existing bookings, so it can't be removed." };
  revalidatePath("/admin/settings");
}

/* ---------- Score categories, tiers, rules (admins and booking managers) ---------- */

export async function saveCategory(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  const row = { name: str(fd, "name"), weight: num(fd, "weight"), source: str(fd, "source") || "manual" };
  if (!row.name) return { error: "Enter a category name." };
  if (!(row.weight >= 0)) return { error: "Weight must be 0 or more." };
  const { error } = id ? await db().from("score_categories").update(row).eq("id", id) : await db().from("score_categories").insert({ ...row, sort: 99 });
  if (error) return { error: error.message };
  return done("/admin/settings");
}

export async function deleteCategory(fd: FormData) {
  await requireSettingsEditor();
  await db().from("score_categories").delete().eq("id", str(fd, "id"));
  revalidatePath("/admin/settings");
}

export async function saveTier(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  const row = { name: str(fd, "name"), min_score: num(fd, "min_score"), color: str(fd, "color") || "#2563EB" };
  if (!row.name) return { error: "Enter a tier name." };
  if (!(row.min_score >= 0 && row.min_score <= 100)) return { error: "Minimum score must be between 0 and 100." };
  const res = id ? await db().from("tiers").update(row).eq("id", id).select("id").single() : await db().from("tiers").insert(row).select("id").single();
  if (res.error) return { error: res.error.message };
  const tierId = (res.data as { id: string }).id;
  const audience = fd.getAll("audience").map(String);
  await db().from("tier_audience").delete().eq("tier_id", tierId);
  if (audience.length) await db().from("tier_audience").insert(audience.map((lookup_id) => ({ tier_id: tierId, lookup_id })));
  return done("/admin/settings");
}

export async function deleteTier(fd: FormData) {
  await requireSettingsEditor();
  await db().from("tiers").delete().eq("id", str(fd, "id"));
  revalidatePath("/admin/settings");
}

export async function saveRules(fd: FormData) {
  await requireSettingsEditor();
  const cancellation = { notice_hours: num(fd, "notice_hours"), min_reason_chars: num(fd, "min_reason_chars") };
  const trainer_response = { hours: num(fd, "response_hours") };
  const availability_deadline = { day_of_month: num(fd, "deadline_day") };
  if ([...Object.values(cancellation), trainer_response.hours, availability_deadline.day_of_month].some((v) => !(v >= 0)))
    return { error: "All values must be numbers of 0 or more." };
  await db().from("settings").upsert([
    { key: "cancellation", value: cancellation },
    { key: "trainer_response", value: trainer_response },
    { key: "availability_deadline", value: availability_deadline },
  ]);
  return done("/admin/settings", "Rules saved.");
}

/* ---------- Team & access (admin only) ---------- */

async function ensureAuthUser(email: string) {
  const { data: existing } = await db().from("app_users").select("id").eq("email", email).maybeSingle();
  if (existing) return { id: (existing as { id: string }).id, isNew: false };
  const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    // An auth user may already exist without an app profile (e.g. a removed member being re-added).
    const { data: list } = await db().auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users.find((x) => x.email?.toLowerCase() === email);
    if (found) return { id: found.id, isNew: false };
    throw new Error(error.message);
  }
  return { id: data.user.id, isNew: true };
}

async function sendInvite(email: string, name: string, roleText: string) {
  const link = await accessLink(email, "recovery");
  await sendEmail(
    email,
    "You're invited to Meska Training Center",
    emailLayout({
      greeting: `Dear ${name.split(" ")[0]},`,
      intro: `You've been given access to Meska Training Center as <b>${roleText}</b>. Use the button below to set your password and sign in. The link works once; if it expires, use “Forgot your password?” on the sign-in page.`,
      button: { label: "Set my password", url: link },
    }),
  );
}

const STAFF_ROLES = ["admin", "approver", "growth"] as const;
const ROLE_TEXT: Record<string, string> = { admin: "Admin", approver: "Booking manager", growth: "Growth" };
const pickRoles = (fd: FormData) => STAFF_ROLES.filter((r) => fd.getAll("roles").map(String).includes(r));
const rolesText = (roles: string[]) => roles.map((r) => ROLE_TEXT[r] ?? r).join(" + ");

// One email can hold several roles (e.g. Booking manager + Growth); the highest becomes the main one.
export async function addTeamMember(fd: FormData) {
  const me = await requireRole("admin");
  const email = str(fd, "email").toLowerCase();
  const full_name = str(fd, "full_name");
  const roles = pickRoles(fd);
  if (!email || !full_name) return { error: "Enter a name and email." };
  if (!roles.length) return { error: "Tick at least one role." };
  try {
    const { id } = await ensureAuthUser(email);
    const { error } = await db()
      .from("app_users")
      .upsert({ id, email, full_name, role: mainRole(roles), roles, can_manage_trainers: fd.get("can_manage_trainers") === "on" });
    if (error) return { error: error.message };
    await sendInvite(email, full_name, rolesText(roles));
    await audit(me.id, "team_member_added", null, { email, roles });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  return done("/admin/users", `Invitation sent to ${email}.`);
}

export async function updateTeamMember(fd: FormData) {
  const me = await requireRole("admin");
  const id = str(fd, "id");
  const roles = pickRoles(fd);
  if (!roles.length) return { error: "Tick at least one role, or remove the member." };
  if (id === me.id && !roles.includes("admin")) return { error: "You can't remove your own admin access." };
  await db().from("app_users").update({ role: mainRole(roles), roles, can_manage_trainers: fd.get("can_manage_trainers") === "on" }).eq("id", id);
  return done("/admin/users", "Access saved.");
}

export async function removeTeamMember(fd: FormData) {
  const me = await requireRole("admin");
  const id = str(fd, "id");
  if (id === me.id) return { error: "You can't remove yourself." };
  // Someone who is also a trainer keeps the trainer pages; only the team access goes.
  const { data: t } = await db().from("trainers").select("id").eq("user_id", id).maybeSingle();
  if (t) await db().from("app_users").update({ role: "trainer", roles: [], can_manage_trainers: false }).eq("id", id);
  else await db().from("app_users").delete().eq("id", id);
  await audit(me.id, "team_member_removed", null, { id });
  revalidatePath("/admin/users");
}

export async function resendTeamInvite(fd: FormData) {
  await requireRole("admin");
  const { data } = await db().from("app_users").select("email, full_name, role, roles").eq("id", str(fd, "id")).single();
  const u = data as { email: string; full_name: string; role: string; roles: string[] | null };
  await sendInvite(u.email, u.full_name, rolesText(u.roles?.length ? u.roles : [u.role]));
  return { ok: `Invitation re-sent to ${u.email}.` };
}

/* ---------- Trainer profiles (admin or Mahmoud) ---------- */

function trainerFields(fd: FormData) {
  return {
    full_name: str(fd, "full_name"),
    email: str(fd, "email").toLowerCase() || null,
    phone: str(fd, "phone") || null,
    bio: str(fd, "bio") || null,
    active: fd.get("active") !== "off",
    title: str(fd, "title") || null,
    overview: str(fd, "overview") || null,
    credentials: str(fd, "credentials") || null,
    footprint_intro: str(fd, "footprint_intro") || null,
    footprint: str(fd, "footprint") || null,
    expertise: str(fd, "expertise") || null,
    thought_leadership: str(fd, "thought_leadership") || null,
    feedback_name: str(fd, "feedback_name") || null,
  };
}

async function saveTrainerTags(trainerId: string, fd: FormData) {
  const skills = fd.getAll("skills").map(String);
  const lookups = fd.getAll("lookups").map(String);
  await db().from("trainer_skills").delete().eq("trainer_id", trainerId);
  await db().from("trainer_lookups").delete().eq("trainer_id", trainerId);
  if (skills.length) await db().from("trainer_skills").insert(skills.map((skill_id) => ({ trainer_id: trainerId, skill_id })));
  if (lookups.length) await db().from("trainer_lookups").insert(lookups.map((lookup_id) => ({ trainer_id: trainerId, lookup_id })));
}

export async function createTrainer(fd: FormData) {
  const me = await requireTrainerManager();
  const row = trainerFields(fd);
  if (!row.full_name) return { error: "Enter the trainer's name." };
  const { data, error } = await db().from("trainers").insert(row).select("id").single();
  if (error) return { error: error.code === "23505" ? "A trainer with that email already exists." : error.message };
  const id = (data as { id: string }).id;
  await saveTrainerTags(id, fd);
  await audit(me.id, "trainer_created", null, { id, name: row.full_name });
  // the create form uploads the photo and CV next, then opens the edit page
  return { ok: "Profile created.", id };
}

export async function updateTrainer(fd: FormData) {
  await requireTrainerManager();
  const id = str(fd, "id");
  const row = trainerFields(fd);
  if (!row.full_name) return { error: "Enter the trainer's name." };
  const { error } = await db().from("trainers").update(row).eq("id", id);
  if (error) return { error: error.code === "23505" ? "Another trainer already uses that email." : error.message };
  await saveTrainerTags(id, fd);
  // keep the login profile's name/email in step
  const { data: t } = await db().from("trainers").select("user_id").eq("id", id).single();
  const uid = (t as { user_id: string | null }).user_id;
  if (uid) await db().from("app_users").update({ full_name: row.full_name }).eq("id", uid);
  revalidatePath(`/trainers/${id}`);
  return { ok: "Profile saved." };
}

export async function saveTrainerScores(fd: FormData) {
  await requireTrainerManager();
  const id = str(fd, "id");
  const rows: { trainer_id: string; category_id: string; score: number; updated_at: string }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("score_") || String(v).trim() === "") continue;
    const score = Number(v);
    if (!(score >= 0 && score <= 100)) return { error: "Scores must be between 0 and 100." };
    rows.push({ trainer_id: id, category_id: k.slice(6), score, updated_at: new Date().toISOString() });
  }
  const cleared = [...fd.entries()].filter(([k, v]) => k.startsWith("score_") && String(v).trim() === "").map(([k]) => k.slice(6));
  if (rows.length) await db().from("trainer_scores").upsert(rows);
  if (cleared.length) await db().from("trainer_scores").delete().eq("trainer_id", id).in("category_id", cleared);
  const fixed = str(fd, "fixed_total");
  if (fixed && !(Number(fixed) >= 0 && Number(fixed) <= 100)) return { error: "The fixed total must be between 0 and 100." };
  await db().from("trainers").update({ score_override: fixed ? Number(fixed) : null }).eq("id", id);
  revalidatePath(`/trainers/${id}`);
  return { ok: "Scores saved. Total and tier are updated." };
}

export async function inviteTrainer(fd: FormData) {
  const me = await requireTrainerManager();
  const id = str(fd, "id");
  const { data } = await db().from("trainers").select("*").eq("id", id).single();
  const t = data as { id: string; full_name: string; email: string | null; user_id: string | null };
  if (!t.email) return { error: "Add the trainer's email to the profile first." };
  try {
    const { id: uid } = await ensureAuthUser(t.email);
    const { data: existing } = await db().from("app_users").select("role").eq("id", uid).maybeSingle();
    // A team member (e.g. the L&D director) keeps their role and simply gets the trainer pages too.
    if (!existing) await db().from("app_users").insert({ id: uid, email: t.email, full_name: t.full_name, role: "trainer" });
    await db().from("trainers").update({ user_id: uid, invited_at: new Date().toISOString() }).eq("id", id);
    await sendInvite(t.email, t.full_name, "a Meska trainer");
    await audit(me.id, "trainer_invited", null, { id, email: t.email });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/trainers/${id}`);
  return { ok: `Invitation sent to ${t.email}.` };
}

type TrainerFile = "photo" | "cv";
const FILE_BUCKET = { photo: "photos", cv: "cvs" } as const;

// Files go straight from the browser to storage with a one-time signed URL (no server size limit).
export async function createTrainerFileUpload(trainerId: string, kind: TrainerFile, fileName: string) {
  await requireTrainerManager();
  const lower = fileName.toLowerCase();
  const ext = kind === "photo" ? (lower.endsWith(".png") ? "png" : "jpg") : (lower.match(/\.(pdf|docx?)$/)?.[1] ?? "pdf");
  const path = `${trainerId}/${kind}-${Date.now()}.${ext}`;
  const { data, error } = await db().storage.from(FILE_BUCKET[kind]).createSignedUploadUrl(path);
  if (error) return { error: error.message };
  return { path, token: data.token };
}

export async function saveTrainerFile(trainerId: string, kind: TrainerFile, path: string, fileName: string) {
  const me = await requireTrainerManager();
  if (!path.startsWith(trainerId + "/")) return { error: "Invalid upload." };
  const col = kind === "photo" ? "photo_path" : "cv_path";
  const { data: old } = await db().from("trainers").select(col).eq("id", trainerId).single();
  await db().from("trainers").update(kind === "photo" ? { photo_path: path } : { cv_path: path, cv_name: fileName.slice(0, 200) }).eq("id", trainerId);
  const prev = (old as Record<string, string | null> | null)?.[col];
  if (prev && prev !== path) await db().storage.from(FILE_BUCKET[kind]).remove([prev]);
  if (kind === "cv") await audit(me.id, "trainer_cv_uploaded", null, { id: trainerId, file: fileName });
  revalidatePath(`/trainers/${trainerId}`);
  revalidatePath(`/trainers/${trainerId}/edit`);
  return { ok: kind === "photo" ? "Photo updated." : "CV uploaded." };
}

/* ---------- Feedback import (admin only) ---------- */

type ArtifactSession = { group?: string; program?: string; title?: string; date?: string; trainers?: string[]; n?: number; delivery?: number | null; content?: number | null; days?: string };

export async function importFeedback(fd: FormData) {
  const me = await requireRole("admin");
  let text = str(fd, "json");
  const file = fd.get("file");
  if (!text && file instanceof File && file.size) text = await file.text();
  if (!text) return { error: "Paste the data or choose a file." };
  // Accept either the raw JSON or the whole scorecard HTML page (data lives in <script id="data">).
  const m = text.match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/);
  if (m) text = m[1];
  let sessions: ArtifactSession[];
  let delivered: Record<string, { total?: number }> = {};
  try {
    const parsed = JSON.parse(text);
    sessions = Array.isArray(parsed) ? parsed : parsed.sessions;
    delivered = (!Array.isArray(parsed) && parsed.delivered) || {};
    if (!Array.isArray(sessions)) throw new Error();
  } catch {
    return { error: "Couldn't read that data. Upload the scorecard page (.html) or its JSON." };
  }
  const rows = sessions.flatMap((s) =>
    (s.trainers ?? []).slice(0, 1).map((trainer) => ({
      trainer_name: trainer,
      client: s.group ?? null,
      program: [s.program, s.title, s.days ? `Day ${s.days}` : null].filter(Boolean).join(" · "),
      session_date: s.date || null,
      responses: s.n ?? 0,
      delivery: s.delivery ?? null,
      content: s.content ?? null,
      source_key: [trainer, s.group, s.title, s.date, s.days].join("|"),
    })),
  );
  if (!rows.length) return { error: "No sessions with a trainer were found." };
  const { error } = await db().from("feedback_sessions").upsert(rows, { onConflict: "source_key" });
  if (error) return { error: error.message };
  const totals = Object.entries(delivered)
    .filter(([, v]) => typeof v?.total === "number")
    .map(([trainer_name, v]) => ({ trainer_name, total: v.total!, as_of: new Date().toISOString().slice(0, 10), imported_at: new Date().toISOString() }));
  if (totals.length) await db().from("delivered_history").upsert(totals);
  await audit(me.id, "feedback_imported", null, { sessions: rows.length });
  revalidatePath("/admin/feedback");
  return { ok: `Imported ${rows.length} sessions. Feedback scores are updated on every trainer profile.` };
}
