// A complete, valid New deal that each test changes one field of. Growth never picks a trainer, so no day has
// one; tests for the booking team add trainer_id themselves.
import type { NewRequest } from "@/lib/deal";

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";

export function validRequest(over: Partial<NewRequest> = {}): NewRequest {
  return {
    company_name: "Aman Holding",
    program_name: "Aman Holding HR",
    industry_id: INDUSTRY,
    contact: { name: "Mona Adel", email: "Mona@Client.com ", mobile: "+20 100 000 0000" },
    participants: [
      { name: "Ahmed Ali", title: "HR Manager", department: "Human Resources" },
      { name: "Sara Hassan", title: "", department: "Finance" },
    ],
    proposal: { path: `${USER}/abc-proposal.pdf`, name: "Proposal.pdf", size: 1024 },
    value_per_day: 100000,
    deal_days: 1,
    same_trainer: false,
    days: [{ day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00", location: "Cairo" }],
    ...over,
  };
}
