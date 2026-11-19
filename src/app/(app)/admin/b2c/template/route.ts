import { getCurrentUser } from "@/lib/auth";
import { b2cTemplate } from "@/lib/b2c-xlsx";

// The empty B2C Sessions template, for admins only.
export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return new Response("Not found", { status: 404 });
  return new Response(await b2cTemplate(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="B2C Sessions template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
