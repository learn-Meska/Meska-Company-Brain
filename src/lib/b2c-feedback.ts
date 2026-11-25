import { hasAccess } from "./team-access";

type Viewer = Parameters<typeof hasAccess>[0] & { trainer_id: string | null };

// Who can download a B2C session's feedback QR code: the booking team (like a booking day's QR) and the session's own trainer.
export const canGetB2CQr = (u: Viewer, trainerId: string | null) => hasAccess(u, "te.dashboard") || (!!u.trainer_id && u.trainer_id === trainerId);

// The calendar card offers the QR code for upcoming sessions only (today onwards) that the trainer confirmed.
export const offersB2CQr = (s: { status: string; date: string }, today: string) => s.status === "confirmed" && s.date >= today;
