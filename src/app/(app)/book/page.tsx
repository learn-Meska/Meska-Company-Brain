import { redirect } from "next/navigation";

// "Book a trainer" was retired: every training starts as a request and is assigned from the calendar.
export default function BookPage() {
  redirect("/request");
}
