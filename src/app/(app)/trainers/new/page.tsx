import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { TrainerForm } from "@/components/trainer-form";
import { requireTrainerManager } from "@/lib/auth";

export default async function NewTrainerPage() {
  await requireTrainerManager();
  return (
    <div className="space-y-4">
      <Link href="/trainers" className="text-sm text-blue hover:underline">← All trainers</Link>
      <PageHeader kicker="New" title={<>New trainer profile</>} lead={<>After saving you can add scores, then send the invitation.</>} />
      <TrainerForm />
    </div>
  );
}
