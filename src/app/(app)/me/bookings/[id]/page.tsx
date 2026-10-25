import Link from "next/link";
import { notFound } from "next/navigation";
import { RespondBox } from "@/components/booking-ui";
import { Ticket } from "@/components/ticket";
import { requireTrainer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { BOOKING_SELECT, type BookingRow } from "@/lib/notify";

export default async function MyBookingPage({ params }: PageProps<"/me/bookings/[id]">) {
  const me = await requireTrainer();
  const { id } = await params;
  const { data } = await db().from("bookings").select(BOOKING_SELECT).eq("id", id).eq("trainer_id", me.trainer_id ?? "").maybeSingle();
  const b = data as BookingRow | null;
  if (!b || ["pending_approval", "rejected"].includes(b.status)) notFound();
  return (
    <div className="space-y-5">
      <Link href="/me/bookings" className="text-sm text-blue hover:underline">← My trainings</Link>
      {b.status === "awaiting_trainer" && <RespondBox id={b.id} />}
      <Ticket b={{ ...b, approver_comment: null }} canUpload={false} trainerView />
    </div>
  );
}
