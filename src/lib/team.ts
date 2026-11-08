import "server-only";
import { userById, usersWithRoles } from "./notify";

type TrainingRef = { deal_id: string | null; created_by: string | null };

// Everyone on the Meska side of a training: admins, Training Excellence, the Growth member who requested it
// and, for a New deal, the content team. The person who made the change is left out (notify() removes duplicates).
// Trainers are told separately, because their copy hides the commercial side and any cancellation reason.
export async function trainingTeam(b: TrainingRef, exceptId?: string | null) {
  const [staff, requester] = await Promise.all([usersWithRoles(...(b.deal_id ? ["admin", "approver", "content"] : ["admin", "approver"])), userById(b.created_by)]);
  return [...staff, ...(requester ? [requester] : [])].filter((u) => u.id !== exceptId);
}
