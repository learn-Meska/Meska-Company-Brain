// A complete, valid New deal that each test changes one field of.
import type { NewRequest } from "@/lib/deal";

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const TRAINER = "33333333-3333-4333-8333-333333333333";

export function validRequest(over: Partial<NewRequest> = {}): NewRequest {
  return {
    program_name: "Aman Holding HR",
    industry_id: INDUSTRY,
    contact: { name: "Mona Adel", email: "Mona@Client.com ", mobile: "+20 100 000 0000" },
    participants: [
      { name: "Ahmed Ali", title: "HR Manager", department: "Human Resources" },
      { name: "Sara Hassan", title: "", department: "Finance" },
    ],
    proposal: { path: `${USER}/abc-proposal.pdf`, name: "Proposal.pdf", size: 1024 },
    value_per_day: 100000,
    deal_days: 5,
    same_trainer: false,
    days: [{ day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00", location: "Cairo", content: "Intro to AI", trainer_id: TRAINER }],
    ...over,
  };
}
