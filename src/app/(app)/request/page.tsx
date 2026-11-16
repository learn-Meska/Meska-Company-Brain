import { PageHeader } from "@/components/page-header";
import { RequestBuilder } from "@/components/request-builder";
import { can, requireAccess } from "@/lib/auth";
import { daysFromParam } from "@/lib/availability-check";
import { db } from "@/lib/supabase";
import { isUuid, todayISO } from "@/lib/format";

export default async function RequestPage({ searchParams }: PageProps<"/request">) {
  const me = await requireAccess("growth.new_deal", "te.assign");
  const { days, industry } = await searchParams;
  const { data: industries } = await db().from("lookups").select("id, name").eq("kind", "industry").order("sort");
  // Only the booking team picks a trainer; Growth's deals all go to Training Excellence to assign.
  const canAssign = can(me, "te.assign");
  const today = todayISO();
  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Request"
        title={canAssign ? "Request a training" : "New deal"}
        lead={
          canAssign
            ? "Add the client, the training outline and the training days. Choose a trainer now, or leave days to assign later."
            : "Add the client, the training outline and the training days. The deal goes to Training Excellence, who assign the trainer; you're notified when they do."
        }
      />
      <RequestBuilder
        industries={(industries ?? []) as { id: string; name: string }[]}
        today={today}
        canAssign={canAssign}
        // days and industry carried over from Check availability (past dates are dropped)
        initialDays={daysFromParam(days).filter((d) => d.date >= today)}
        initialIndustry={isUuid(industry) ? industry : ""}
      />
    </div>
  );
}
