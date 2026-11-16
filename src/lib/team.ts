import "server-only";
import { staffById, usersWithRoles } from "./notify";

type TrainingRef = { deal_id: string | null; created_by: string | null };

// Everyone on the Meska side of a training: admins, Training Excellence, the Growth member who requested it
// and, for a New deal, the content team. The person who made the change is left out (notify() removes duplicates),
// except when they made it in the Growth view: Training Excellence must always hear about a Growth change, even
// when the Growth editor also holds Training Excellence (or is an admin previewing Growth).
// Trainers are told separately, because their copy hides the commercial side and any cancellation reason.
// A requester who was since removed from the team gets nothing.
export async function trainingTeam(b: TrainingRef, by?: { id: string; role: string } | null) {
  const [staff, requester] = await Promise.all([usersWithRoles(...(b.deal_id ? ["admin", "approver", "content"] : ["admin", "approver"])), staffById(b.created_by)]);
  // The editor never gets their own change as the requester; as a Training Excellence member they do when they
  // made it from the Growth view.
  const skip = by && by.role !== "growth" ? by.id : null;
  return [...staff.filter((u) => u.id !== skip), ...(requester && requester.id !== by?.id ? [requester] : [])];
}
