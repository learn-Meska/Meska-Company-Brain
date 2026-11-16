import { AvailabilityChecker } from "@/components/availability-checker";
import { PageHeader } from "@/components/page-header";
import { can, requireRole } from "@/lib/auth";
import { todayISO } from "@/lib/format";
import { db } from "@/lib/supabase";

// Growth checks whether a trainer can take some dates before there is a deal. The answer is yes or no per
// day; who is free stays with Training Excellence.
export default async function AvailabilityPage() {
  const me = await requireRole("admin", "growth");
  const { data: industries } = await db().from("lookups").select("id, name").eq("kind", "industry").order("sort");
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Growth"
        title="Check availability"
        lead="See whether a trainer can take the dates a client is asking for, before you create the deal. Training Excellence assigns the trainer once the deal is sent."
      />
      <AvailabilityChecker industries={(industries ?? []) as { id: string; name: string }[]} today={todayISO()} canStartDeal={can(me, "growth.new_deal")} />
    </div>
  );
}
