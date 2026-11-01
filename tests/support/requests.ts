// A complete, valid New deal that each test changes one field of.
import type { NewRequest } from "@/lib/deal";

const USER = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const TRAINER = "33333333-3333-4333-8333-333333333333";

// lookups of kind "audience" (seniority) and "function" (departments)
export const LEVEL_MID = "55555555-5555-4555-8555-555555555551";
export const LEVEL_SENIOR = "55555555-5555-4555-8555-555555555552";
export const DEPT_HR = "66666666-6666-4666-8666-666666666661";
export const DEPT_FIN = "66666666-6666-4666-8666-666666666662";

export function validRequest(over: Partial<NewRequest> = {}): NewRequest {
  return {
    company_name: "Aman Holding",
    program_name: "Aman Holding HR",
    industry_id: INDUSTRY,
    contact: { name: "Mona Adel", email: "Mona@Client.com ", mobile: "+20 100 000 0000" },
    audience: { level_ids: [LEVEL_MID, LEVEL_SENIOR], department_ids: [DEPT_HR, DEPT_FIN], all_departments: false, participant_count: 25 },
    proposal: { path: `${USER}/abc-proposal.pdf`, name: "Proposal.pdf", size: 1024 },
    value_per_day: 100000,
    deal_days: 5,
    same_trainer: false,
    days: [{ day_number: 1, date: "2026-11-10", start: "10:00", end: "15:00", location: "Cairo", trainer_id: TRAINER }],
    ...over,
  };
}
