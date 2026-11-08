import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

// A portal member with no access ticked yet lands here instead of bouncing between pages.
export default async function NoAccessPage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader kicker="Access" title="No access yet" lead="You're in this portal, but no accesses have been given to you yet. Ask your portal admin to choose them on My team." />
    </div>
  );
}
