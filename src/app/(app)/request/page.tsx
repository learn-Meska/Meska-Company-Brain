import { PageHeader } from "@/components/page-header";
import { RequestBuilder } from "@/components/request-builder";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { todayISO } from "@/lib/format";

type L = { id: string; kind: string; name: string };

export default async function RequestPage() {
  const me = await requireRole("growth", "admin", "approver");
  const { data: lookups } = await db().from("lookups").select("*").order("sort");
  const L = (lookups ?? []) as L[];
  const pick = (k: string) => L.filter((l) => l.kind === k).map(({ id, name }) => ({ id, name }));
  return (
    <div className="space-y-5">
      <PageHeader kicker="Request" title="Request a training" lead={me.role === "growth" ? "Tell us about the client and the training days, then choose an available trainer for each day. The trainer is emailed to confirm." : "Tell us about the client and the training days. Choose a trainer now, or leave days for the booking team to assign."} />
      <RequestBuilder audience={pick("audience")} functions={pick("function")} industries={pick("industry")} today={todayISO()} trainerRequired={me.role === "growth"} />
    </div>
  );
}
