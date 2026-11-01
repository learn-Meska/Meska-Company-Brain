import { PageHeader } from "@/components/page-header";
import { RequestBuilder } from "@/components/request-builder";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { todayISO } from "@/lib/format";

export default async function RequestPage() {
  const me = await requireRole("growth", "admin", "approver");
  const { data } = await db().from("lookups").select("id, kind, name").in("kind", ["industry", "audience", "function"]).order("sort").order("name");
  const list = (kind: string) => ((data ?? []) as { id: string; kind: string; name: string }[]).filter((l) => l.kind === kind).map(({ id, name }) => ({ id, name }));
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Request"
        title={me.role === "growth" ? "New deal" : "Request a training"}
        lead={
          me.role === "growth"
            ? "Add the client, who the training is for and the proposal, then the training days with an available trainer for each day. The trainer is emailed to confirm."
            : "Add the client, who the training is for and the proposal, then the training days. Choose a trainer now, or leave days for the booking team to assign."
        }
      />
      <RequestBuilder industries={list("industry")} levels={list("audience")} departments={list("function")} today={todayISO()} trainerRequired={me.role === "growth"} />
    </div>
  );
}
