import { redirect } from "next/navigation";
import { homeFor, requireUser } from "@/lib/auth";

export default async function Home() {
  redirect(homeFor(await requireUser()));
}
