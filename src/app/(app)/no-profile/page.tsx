import { requireUser } from "@/lib/auth";

export default async function NoProfilePage() {
  const u = await requireUser();
  return (
    <div className="card mx-auto max-w-xl text-center">
      <h1 className="h2 mb-2">No trainer profile linked</h1>
      <p className="text-sm text-muted">
        {u.real_role === "admin"
          ? "Your account isn't linked to a trainer profile, so there's nothing to preview in Trainer view. Create a trainer profile with your email and send yourself the invitation, or switch back to another view."
          : "Your login isn't linked to a trainer profile yet. Please contact the admin."}
      </p>
    </div>
  );
}
