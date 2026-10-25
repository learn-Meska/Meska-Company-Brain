import { PageHeader } from "@/components/page-header";
import { TrainerFinder } from "@/components/trainer-finder";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { todayISO } from "@/lib/format";

type L = { id: string; kind: string; name: string };

export default async function FindPage() {
  await requireRole("admin", "approver");
  const [{ data: lookups }, { data: skills }] = await Promise.all([db().from("lookups").select("*").order("sort"), db().from("skills").select("id, name").order("name")]);
  const L = (lookups ?? []) as L[];
  const pick = (k: string) => L.filter((l) => l.kind === k).map(({ id, name }) => ({ id, name }));
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Booking"
        title="Find a trainer"
        lead="Check which trainers are free: add each training day with its own content, then view or download the matching trainer profiles for the client."
      />
      <TrainerFinder audience={pick("audience")} industries={pick("industry")} skills={(skills ?? []) as { id: string; name: string }[]} today={todayISO()} />
    </div>
  );
}
