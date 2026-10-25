import { PageHeader } from "@/components/page-header";
import { RequestBuilder } from "@/components/request-builder";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { todayISO } from "@/lib/format";

type L = { id: string; kind: string; name: string };

export default async function RequestPage() {
  await requireRole("growth", "admin", "approver");
  const [{ data: lookups }, { data: skills }] = await Promise.all([db().from("lookups").select("*").order("sort"), db().from("skills").select("id, name").order("name")]);
  const L = (lookups ?? []) as L[];
  const pick = (k: string) => L.filter((l) => l.kind === k).map(({ id, name }) => ({ id, name }));
  return (
    <div className="space-y-5">
      <PageHeader kicker="Request" title="Request a training" lead="Tell us about the client and the training days. It appears on the calendar right away and the booking team assigns the trainer." />
      <RequestBuilder audience={pick("audience")} functions={pick("function")} industries={pick("industry")} skills={(skills ?? []) as { id: string; name: string }[]} today={todayISO()} />
    </div>
  );
}
