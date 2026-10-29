"use server";

import { revalidatePath } from "next/cache";
import { mainRole, requireRole, requireSettingsEditor, requireTrainerManager } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { emailLayout, sendEmail } from "@/lib/email";
import { isUuid } from "@/lib/format";
import { hasUnprintable } from "@/lib/pdf-text";
import { accessLink } from "@/lib/access-link";
import { audit } from "@/lib/notify";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
// An empty field is "not a number", never 0.
const num = (fd: FormData, k: string) => (str(fd, k) === "" ? NaN : Number(str(fd, k)));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keeps raw database messages in the server log; people get something they can act on.
function failed(where: string, error: { message: string; code?: string }) {
  console.error(`[${where}]`, error.message);
  if (error.code === "23503") return { error: "It's still in use elsewhere, so it can't be changed or removed." };
  if (error.code === "23505") return { error: "That already exists." };
  return { error: "Couldn't save. Please try again." };
}

function done(path: string, ok = "Saved.") {
  revalidatePath(path);
  return { ok };
}

/* ---------- Skills & lists ---------- */

export async function addSkill(fd: FormData) {
  await requireSettingsEditor();
  const name = str(fd, "name").replace(/\s+/g, " ");
  if (!name) return { error: "Enter a skill name." };
  if (name.length > 100) return { error: "Keep the name under 100 characters." };
  const { error } = await db().from("skills").insert({ name });
  if (error) return error.code === "23505" ? { error: "That skill already exists." } : failed("addSkill", error);
  return done("/admin/settings", `Added “${name}”.`);
}

export async function deleteSkill(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Skill not found." };
  // An open training that needs the skill would then match no trainer at all.
  const { count } = await db().from("bookings").select("id", { count: "exact", head: true }).contains("skill_ids", [id]).in("status", ["needs_trainer", "pending_approval", "awaiting_trainer", "confirmed"]);
  if (count) return { error: `${count} active training${count > 1 ? "s need" : " needs"} this skill, so it can't be removed yet.` };
  // Trainers who have it lose the tag.
  await db().from("trainer_skills").delete().eq("skill_id", id);
  const { error } = await db().from("skills").delete().eq("id", id);
  if (error) return failed("deleteSkill", error);
  revalidatePath("/admin/settings");
}

export async function addLookup(fd: FormData) {
  await requireSettingsEditor();
  const name = str(fd, "name").replace(/\s+/g, " ");
  const kind = str(fd, "kind");
  if (!["audience", "function", "industry"].includes(kind)) return { error: "Pick which list to add to." };
  if (!name) return { error: "Enter a name." };
  if (name.length > 100) return { error: "Keep the name under 100 characters." };
  const { data: last } = await db().from("lookups").select("sort").eq("kind", kind).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db().from("lookups").insert({ kind, name, sort: ((last as { sort: number } | null)?.sort ?? 0) + 1 });
  if (error) return error.code === "23505" ? { error: "That one already exists." } : failed("addLookup", error);
  return done("/admin/settings", `Added “${name}”.`);
}

export async function deleteLookup(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Not found." };
  const { count } = await db().from("bookings").select("id", { count: "exact", head: true }).or(`audience_id.eq.${id},function_id.eq.${id},industry_id.eq.${id}`);
  if (count) return { error: `It's used by ${count} booking${count > 1 ? "s" : ""}, so it can't be removed.` };
  // Trainer tags and tier audiences that point at it go with it.
  await db().from("trainer_lookups").delete().eq("lookup_id", id);
  await db().from("tier_audience").delete().eq("lookup_id", id);
  const { error } = await db().from("lookups").delete().eq("id", id);
  if (error) return failed("deleteLookup", error);
  revalidatePath("/admin/settings");
}

/* ---------- Score categories, tiers, rules (admins and booking managers) ---------- */

export async function saveCategory(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  const row = { name: str(fd, "name"), weight: num(fd, "weight"), source: str(fd, "source") || "manual" };
  if (!row.name) return { error: "Enter a category name." };
  if (!(row.weight >= 0 && row.weight <= 1000)) return { error: "Weight must be a number from 0 to 1000." };
  if (row.source !== "manual" && row.source !== "feedback") return { error: "Pick where the score comes from." };
  if (id && !isUuid(id)) return { error: "Category not found." };
  const { error } = id ? await db().from("score_categories").update(row).eq("id", id) : await db().from("score_categories").insert({ ...row, sort: 99 });
  if (error) return failed("saveCategory", error);
  return done("/admin/settings");
}

export async function deleteCategory(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Category not found." };
  await db().from("trainer_scores").delete().eq("category_id", id);
  const { error } = await db().from("score_categories").delete().eq("id", id);
  if (error) return failed("deleteCategory", error);
  revalidatePath("/admin/settings");
}

export async function saveTier(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  const row = { name: str(fd, "name"), min_score: num(fd, "min_score"), color: str(fd, "color") || "#2563EB" };
  if (!row.name) return { error: "Enter a tier name." };
  if (!(row.min_score >= 0 && row.min_score <= 100)) return { error: "Minimum score must be between 0 and 100." };
  if (!/^#[0-9a-f]{6}$/i.test(row.color)) return { error: "Pick a colour." };
  if (id && !isUuid(id)) return { error: "Tier not found." };
  // Only audience levels that still exist, so one stale tick can't wipe the whole list.
  const picked = fd.getAll("audience").map(String).filter(isUuid);
  const { data: live, error: liveError } = picked.length ? await db().from("lookups").select("id").eq("kind", "audience").in("id", picked) : { data: [], error: null };
  if (liveError) return failed("saveTier audience", liveError);
  const audience = ((live ?? []) as { id: string }[]).map((l) => l.id);
  const res = id ? await db().from("tiers").update(row).eq("id", id).select("id").single() : await db().from("tiers").insert(row).select("id").single();
  if (res.error) return failed("saveTier", res.error);
  const tierId = (res.data as { id: string }).id;
  if (audience.length) {
    const { error } = await db().from("tier_audience").upsert(audience.map((lookup_id) => ({ tier_id: tierId, lookup_id })));
    if (error) return failed("saveTier audience", error);
  }
  let clear = db().from("tier_audience").delete().eq("tier_id", tierId);
  if (audience.length) clear = clear.not("lookup_id", "in", `(${audience.join(",")})`);
  const { error } = await clear;
  if (error) return failed("saveTier audience", error);
  return done("/admin/settings");
}

export async function deleteTier(fd: FormData) {
  await requireSettingsEditor();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Tier not found." };
  await db().from("tier_audience").delete().eq("tier_id", id);
  const { error } = await db().from("tiers").delete().eq("id", id);
  if (error) return failed("deleteTier", error);
  revalidatePath("/admin/settings");
}

export async function saveRules(fd: FormData) {
  await requireSettingsEditor();
  const cancellation = { notice_hours: num(fd, "notice_hours"), min_reason_chars: num(fd, "min_reason_chars") };
  const trainer_response = { hours: num(fd, "response_hours") };
  const availability_deadline = { day_of_month: num(fd, "deadline_day") };
  if (![...Object.values(cancellation), trainer_response.hours, availability_deadline.day_of_month].every((v) => Number.isInteger(v) && v >= 0))
    return { error: "All values must be whole numbers of 0 or more." };
  if (cancellation.notice_hours > 720 || cancellation.min_reason_chars > 2000) return { error: "Short notice can be at most 720 hours and the reason at most 2,000 characters." };
  if (trainer_response.hours < 1 || trainer_response.hours > 720) return { error: "The trainer must confirm within 1 to 720 hours." };
  if (availability_deadline.day_of_month < 1 || availability_deadline.day_of_month > 28) return { error: "Availability is due on a day from 1 to 28." };
  const { error } = await db().from("settings").upsert([
    { key: "cancellation", value: cancellation },
    { key: "trainer_response", value: trainer_response },
    { key: "availability_deadline", value: availability_deadline },
  ]);
  if (error) return failed("saveRules", error);
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
// Trainer management only takes effect in a booking-manager view (Growth views ignore it), so only store it there.
const managesTrainers = (fd: FormData, roles: string[]) => fd.get("can_manage_trainers") === "on" && roles.includes("approver");

// One email can hold several roles (e.g. Booking manager + Growth); the highest becomes the main one.
export async function addTeamMember(fd: FormData) {
  const me = await requireRole("admin");
  const email = str(fd, "email").toLowerCase();
  const full_name = str(fd, "full_name");
  const roles = pickRoles(fd);
  if (!email || !full_name) return { error: "Enter a name and email." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!roles.length) return { error: "Tick at least one role." };
  // Adding never overwrites someone who already has access: their roles are changed in the table instead.
  const { data: existing } = await db().from("app_users").select("id, roles").eq("email", email).maybeSingle();
  const held = (existing as { id: string; roles: string[] | null } | null)?.roles ?? [];
  if (existing && held.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) return { error: "That person is already on the team. Change their access in the table below." };
  try {
    const { id } = await ensureAuthUser(email);
    // A previously removed member was blocked from signing in; adding them back lifts that.
    await db().auth.admin.updateUserById(id, { ban_duration: "none" });
    // A trainer being added to the team keeps the trainer pages.
    const all = [...new Set([...held, ...roles])];
    const { error } = await db()
      .from("app_users")
      .upsert({ id, email, full_name, role: mainRole(all), roles: all, can_manage_trainers: managesTrainers(fd, all) });
    if (error) return failed("addTeamMember", error);
    await audit(me.id, "team_member_added", null, { email, roles });
    await sendInvite(email, full_name, rolesText(roles));
  } catch (e) {
    console.error("[addTeamMember]", e instanceof Error ? e.message : e);
    return { error: "The member was saved but the invitation couldn't be sent. Use “Resend invite” to try again." };
  }
  return done("/admin/users", `Invitation sent to ${email}.`);
}

export async function updateTeamMember(fd: FormData) {
  const me = await requireRole("admin");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Member not found." };
  const roles = pickRoles(fd);
  if (!roles.length) return { error: "Tick at least one role, or remove the member." };
  if (id === me.id && !roles.includes("admin")) return { error: "You can't remove your own admin access." };
  const { data: cur } = await db().from("app_users").select("roles").eq("id", id).maybeSingle();
  if (!cur) return { error: "Member not found." };
  // Keep the trainer role if they have one; only the staff roles are edited here.
  const keep = ((cur as { roles: string[] | null }).roles ?? []).filter((r) => !(STAFF_ROLES as readonly string[]).includes(r));
  const all = [...new Set([...roles, ...keep])];
  const { error } = await db().from("app_users").update({ role: mainRole(all), roles: all, can_manage_trainers: managesTrainers(fd, all) }).eq("id", id);
  if (error) return failed("updateTeamMember", error);
  return done("/admin/users", "Access saved.");
}

// Access is taken away, not the record: their name stays on past bookings and in the activity log,
// and their sign-in is blocked so an open session or an old invite link stops working.
export async function removeTeamMember(fd: FormData) {
  const me = await requireRole("admin");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Member not found." };
  if (id === me.id) return { error: "You can't remove yourself." };
  const { data: cur } = await db().from("app_users").select("roles").eq("id", id).maybeSingle();
  if (!cur) return { error: "Member not found." };
  // Someone who is also a trainer keeps the trainer pages; only the team access goes.
  const { data: t } = await db().from("trainers").select("id").eq("user_id", id).maybeSingle();
  const { error } = await db()
    .from("app_users")
    .update({ role: "trainer", roles: [], can_manage_trainers: false })
    .eq("id", id);
  if (error) return failed("removeTeamMember", error);
  if (!t) {
    const { error: banError } = await db().auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (banError) console.error("[removeTeamMember ban]", banError.message);
  }
  await audit(me.id, "team_member_removed", null, { id });
  revalidatePath("/admin/users");
}

export async function resendTeamInvite(fd: FormData) {
  await requireRole("admin");
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Member not found." };
  const { data } = await db().from("app_users").select("email, full_name, role, roles").eq("id", id).maybeSingle();
  const u = data as { email: string; full_name: string; role: string; roles: string[] | null } | null;
  if (!u) return { error: "Member not found." };
  try {
    await sendInvite(u.email, u.full_name, rolesText(u.roles?.length ? u.roles : [u.role]));
  } catch (e) {
    console.error("[resendTeamInvite]", e instanceof Error ? e.message : e);
    return { error: "The invitation couldn't be sent. Please try again." };
  }
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

// Replaces a trainer's skills and tags. Only ids that still exist are kept, and new rows go in
// before old ones come out, so a stale form can never leave the trainer with nothing.
async function saveTrainerTags(trainerId: string, fd: FormData) {
  const wantSkills = [...new Set(fd.getAll("skills").map(String).filter(isUuid))];
  const wantLookups = [...new Set(fd.getAll("lookups").map(String).filter(isUuid))];
  const [{ data: s, error: se }, { data: l, error: le }] = await Promise.all([
    wantSkills.length ? db().from("skills").select("id").in("id", wantSkills) : Promise.resolve({ data: [], error: null }),
    wantLookups.length ? db().from("lookups").select("id").in("id", wantLookups) : Promise.resolve({ data: [], error: null }),
  ]);
  // If the lists can't be read, change nothing: an empty answer here would delete every tag below.
  if (se || le) return failed("saveTrainerTags", (se ?? le)!);
  const skills = ((s ?? []) as { id: string }[]).map((x) => x.id);
  const lookups = ((l ?? []) as { id: string }[]).map((x) => x.id);
  if (skills.length) {
    const { error } = await db().from("trainer_skills").upsert(skills.map((skill_id) => ({ trainer_id: trainerId, skill_id })));
    if (error) return failed("saveTrainerTags", error);
  }
  if (lookups.length) {
    const { error } = await db().from("trainer_lookups").upsert(lookups.map((lookup_id) => ({ trainer_id: trainerId, lookup_id })));
    if (error) return failed("saveTrainerTags", error);
  }
  let dropSkills = db().from("trainer_skills").delete().eq("trainer_id", trainerId);
  if (skills.length) dropSkills = dropSkills.not("skill_id", "in", `(${skills.join(",")})`);
  let dropLookups = db().from("trainer_lookups").delete().eq("trainer_id", trainerId);
  if (lookups.length) dropLookups = dropLookups.not("lookup_id", "in", `(${lookups.join(",")})`);
  const [a, b] = await Promise.all([dropSkills, dropLookups]);
  if (a.error || b.error) return failed("saveTrainerTags", (a.error ?? b.error)!);
  return null;
}

// The profile PDF can only print Latin text; say so instead of letting it vanish silently.
function pdfNote(row: ReturnType<typeof trainerFields>) {
  const fields = [row.full_name, row.title, row.overview, row.credentials, row.footprint_intro, row.footprint, row.expertise, row.thought_leadership];
  return fields.some(hasUnprintable) ? " Note: some characters (e.g. Arabic) can't be printed in the profile PDF and will be left out there; the profile page shows them." : "";
}

function checkTrainer(row: ReturnType<typeof trainerFields>) {
  if (!row.full_name) return "Enter the trainer's name.";
  if (row.full_name.length > 120) return "Keep the name under 120 characters.";
  if (row.email && !EMAIL.test(row.email)) return "Enter a valid email address.";
  return null;
}

export async function createTrainer(fd: FormData) {
  const me = await requireTrainerManager();
  const row = trainerFields(fd);
  const invalid = checkTrainer(row);
  if (invalid) return { error: invalid };
  const { data, error } = await db().from("trainers").insert(row).select("id").single();
  if (error) return error.code === "23505" ? { error: "A trainer with that email already exists." } : failed("createTrainer", error);
  const id = (data as { id: string }).id;
  const tagError = await saveTrainerTags(id, fd);
  await audit(me.id, "trainer_created", null, { id, name: row.full_name });
  // the create form uploads the photo and CV next, then opens the edit page
  return { ok: (tagError ? "Profile created, but the skills couldn't be saved. Add them on the edit page." : "Profile created.") + pdfNote(row), id };
}

export async function updateTrainer(fd: FormData) {
  const me = await requireTrainerManager();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Trainer not found." };
  const row = trainerFields(fd);
  const invalid = checkTrainer(row);
  if (invalid) return { error: invalid };
  const { data: cur } = await db().from("trainers").select("user_id, email").eq("id", id).maybeSingle();
  if (!cur) return { error: "Trainer not found." };
  const { user_id: uid, email: oldEmail } = cur as { user_id: string | null; email: string | null };
  const emailChanged = (oldEmail ?? null) !== row.email;
  // The email is their sign-in once invited, so it moves with the login (admins only) or not at all.
  if (uid && emailChanged) {
    if (me.role !== "admin") return { error: "This trainer already has a login. Only an admin can change their email." };
    if (!row.email) return { error: "A trainer with a login needs an email." };
    const { data: taken } = await db().from("app_users").select("id").eq("email", row.email).neq("id", uid).maybeSingle();
    if (taken) return { error: "Another login already uses that email." };
    const { error: authError } = await db().auth.admin.updateUserById(uid, { email: row.email, email_confirm: true });
    if (authError) return failed("updateTrainer email", authError);
  }
  const { error } = await db().from("trainers").update(row).eq("id", id);
  if (error) return error.code === "23505" ? { error: "Another trainer already uses that email." } : failed("updateTrainer", error);
  const tagError = await saveTrainerTags(id, fd);
  // keep the login profile's name/email in step
  if (uid) await db().from("app_users").update({ full_name: row.full_name, ...(emailChanged && row.email ? { email: row.email } : {}) }).eq("id", uid);
  revalidatePath(`/trainers/${id}`);
  return tagError ?? { ok: "Profile saved." + pdfNote(row) };
}

export async function saveTrainerScores(fd: FormData) {
  await requireTrainerManager();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Trainer not found." };
  // Check everything before writing anything.
  const fixed = str(fd, "fixed_total");
  if (fixed && !(Number(fixed) >= 0 && Number(fixed) <= 100)) return { error: "The fixed total must be between 0 and 100." };
  const { data: cats } = await db().from("score_categories").select("id");
  const known = new Set(((cats ?? []) as { id: string }[]).map((c) => c.id));
  const rows: { trainer_id: string; category_id: string; score: number; updated_at: string }[] = [];
  const cleared: string[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("score_") || !known.has(k.slice(6))) continue;
    if (String(v).trim() === "") {
      cleared.push(k.slice(6));
      continue;
    }
    const score = Number(v);
    if (!(score >= 0 && score <= 100)) return { error: "Scores must be between 0 and 100." };
    rows.push({ trainer_id: id, category_id: k.slice(6), score, updated_at: new Date().toISOString() });
  }
  if (rows.length) {
    const { error } = await db().from("trainer_scores").upsert(rows);
    if (error) return failed("saveTrainerScores", error);
  }
  if (cleared.length) {
    const { error } = await db().from("trainer_scores").delete().eq("trainer_id", id).in("category_id", cleared);
    if (error) return failed("saveTrainerScores", error);
  }
  const { error } = await db().from("trainers").update({ score_override: fixed ? Number(fixed) : null }).eq("id", id);
  if (error) return failed("saveTrainerScores", error);
  revalidatePath(`/trainers/${id}`);
  return { ok: "Scores saved. Total and tier are updated." };
}

export async function inviteTrainer(fd: FormData) {
  const me = await requireTrainerManager();
  const id = str(fd, "id");
  if (!isUuid(id)) return { error: "Trainer not found." };
  const { data } = await db().from("trainers").select("*").eq("id", id).maybeSingle();
  const t = data as { id: string; full_name: string; email: string | null; user_id: string | null } | null;
  if (!t) return { error: "Trainer not found." };
  if (!t.email) return { error: "Add the trainer's email to the profile first." };
  try {
    // An invited trainer keeps their login; a re-invite only sends a fresh link.
    const uid = t.user_id ?? (await ensureAuthUser(t.email)).id;
    if (t.user_id) {
      // Profiles edited before emails moved with the login may point at an old sign-in address.
      const { data: authUser } = await db().auth.admin.getUserById(uid);
      if (authUser?.user && authUser.user.email?.toLowerCase() !== t.email) {
        const { data: taken } = await db().from("app_users").select("id").eq("email", t.email).neq("id", uid).maybeSingle();
        if (taken) return { error: "Another login already uses this trainer's email. Change the email on the profile first." };
        const { error: emailError } = await db().auth.admin.updateUserById(uid, { email: t.email, email_confirm: true });
        if (emailError) return failed("inviteTrainer email", emailError);
        await db().from("app_users").update({ email: t.email }).eq("id", uid);
      }
    }
    // A login blocked when someone was removed from the team must be able to sign in as a trainer.
    await db().auth.admin.updateUserById(uid, { ban_duration: "none" });
    const { data: existing } = await db().from("app_users").select("roles").eq("id", uid).maybeSingle();
    if (!t.user_id) {
      const { data: other } = await db().from("trainers").select("id").eq("user_id", uid).neq("id", id).maybeSingle();
      if (other) return { error: "That email's login is already linked to another trainer profile." };
      // Only an admin may attach the trainer pages to a team member's login.
      const staff = ((existing as { roles: string[] | null } | null)?.roles ?? []).some((r) => (STAFF_ROLES as readonly string[]).includes(r));
      if (staff && me.role !== "admin") return { error: "That email belongs to a team member. Ask an admin to link it." };
    }
    // A team member (e.g. the L&D director) keeps their role and simply gets the trainer pages too.
    if (!existing) {
      const { error } = await db().from("app_users").insert({ id: uid, email: t.email, full_name: t.full_name, role: "trainer" });
      if (error) return failed("inviteTrainer", error);
    }
    const { error } = await db().from("trainers").update({ user_id: uid, invited_at: new Date().toISOString() }).eq("id", id);
    if (error) return failed("inviteTrainer", error);
    await sendInvite(t.email, t.full_name, "a Meska trainer");
    await audit(me.id, "trainer_invited", null, { id, email: t.email });
  } catch (e) {
    console.error("[inviteTrainer]", e instanceof Error ? e.message : e);
    return { error: "The invitation couldn't be sent. Please try again." };
  }
  revalidatePath(`/trainers/${id}`);
  return { ok: `Invitation sent to ${t.email}.` };
}

type TrainerFile = "photo" | "cv";
const FILE_BUCKET = { photo: "photos", cv: "cvs" } as const;

// Files go straight from the browser to storage with a one-time signed URL (no server size limit).
export async function createTrainerFileUpload(trainerId: string, kind: TrainerFile, fileName: string) {
  await requireTrainerManager();
  if (!isUuid(trainerId) || (kind !== "photo" && kind !== "cv")) return { error: "Trainer not found." };
  const { data: exists } = await db().from("trainers").select("id").eq("id", trainerId).maybeSingle();
  if (!exists) return { error: "Trainer not found." };
  const lower = String(fileName).toLowerCase();
  const ext = kind === "photo" ? (lower.endsWith(".png") ? "png" : "jpg") : (lower.match(/\.(pdf|docx?)$/)?.[1] ?? "pdf");
  const path = `${trainerId}/${kind}-${Date.now()}.${ext}`;
  const { data, error } = await db().storage.from(FILE_BUCKET[kind]).createSignedUploadUrl(path);
  if (error) return failed("createTrainerFileUpload", error);
  return { path, token: data.token };
}

export async function saveTrainerFile(trainerId: string, kind: TrainerFile, path: string, fileName: string) {
  const me = await requireTrainerManager();
  if (!isUuid(trainerId) || (kind !== "photo" && kind !== "cv")) return { error: "Trainer not found." };
  // Only a path this app handed out for that trainer and kind.
  if (!new RegExp(`^${trainerId}/${kind}-\\d+\\.(png|jpg|pdf|docx?)$`).test(path)) return { error: "Invalid upload." };
  const col = kind === "photo" ? "photo_path" : "cv_path";
  const { data: old } = await db().from("trainers").select(col).eq("id", trainerId).maybeSingle();
  if (!old) return { error: "Trainer not found." };
  const { error } = await db().from("trainers").update(kind === "photo" ? { photo_path: path } : { cv_path: path, cv_name: String(fileName).slice(0, 200) }).eq("id", trainerId);
  if (error) return failed("saveTrainerFile", error);
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
  if (file instanceof File && file.size > 4 * 1024 * 1024) return { error: "That file is over 4 MB. Upload just the scorecard's data (.json) instead." };
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
  const score = (v: unknown) => (typeof v === "number" && v >= 0 && v <= 5 ? v : null);
  const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const all = sessions
    .filter((s) => s && typeof s === "object")
    .flatMap((s) =>
      (Array.isArray(s.trainers) ? s.trainers : [])
        .filter((t): t is string => typeof t === "string" && !!t.trim())
        .slice(0, 1)
        .map((trainer) => ({
          trainer_name: trainer.trim(),
          client: s.group ?? null,
          program: [s.program, s.title, s.days ? `Day ${s.days}` : null].filter(Boolean).join(" · "),
          session_date: isoDate(s.date),
          responses: Number.isInteger(s.n) && s.n! >= 0 ? s.n! : 0,
          delivery: score(s.delivery),
          content: score(s.content),
          source_key: [trainer.trim(), s.group, s.title, s.date, s.days].join("|"),
        })),
    );
  // One row per key: the same session listed twice would make the whole upsert fail.
  const rows = [...new Map(all.map((r) => [r.source_key, r])).values()];
  if (!rows.length) return { error: "No sessions with a trainer were found." };
  const { error } = await db().from("feedback_sessions").upsert(rows, { onConflict: "source_key" });
  if (error) return failed("importFeedback", error);
  const totals = Object.entries(delivered && typeof delivered === "object" ? delivered : {})
    .filter(([name, v]) => name.trim() && typeof v?.total === "number" && Number.isInteger(v.total) && v.total >= 0)
    .map(([trainer_name, v]) => ({ trainer_name: trainer_name.trim(), total: v.total!, as_of: new Date().toISOString().slice(0, 10), imported_at: new Date().toISOString() }));
  if (totals.length) {
    const { error: totalsError } = await db().from("delivered_history").upsert(totals);
    if (totalsError) return failed("importFeedback delivered", totalsError);
  }
  await audit(me.id, "feedback_imported", null, { sessions: rows.length });
  revalidatePath("/admin/feedback");
  return { ok: `Imported ${rows.length} sessions. Feedback scores are updated on every trainer profile.` };
}
