import { cairoStart, trainerTitle } from "./format";

type B = { id: string; program_name: string; day_number: number; date: string; start_time: string; end_time: string; location: string | null; content: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// Every kind of line break becomes "\n" and other control characters are dropped, so text can't start a new property.
const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n|\u2028|\u2029/g, "\\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
const utf8 = new TextEncoder();
// RFC 5545 lines must be folded at 75 octets; count UTF-8 bytes and never split a character.
function fold(line: string) {
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = utf8.encode(ch).length;
    if (bytes + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

// Calendar event for the trainer (title follows the 2-day program-name rule).
// SEQUENCE is the send time, so every later invite for the same UID (an edit, a cancellation)
// outranks the one the trainer already has and calendars replace it; `cancelled` removes it.
// CANCEL needs an ORGANIZER for calendars to accept it: the address the system emails come from.
export function trainingIcs(b: B, link: string, cancelled = false) {
  const start = cairoStart(b.date, b.start_time);
  const end = cairoStart(b.date, b.end_time);
  const sequence = Math.floor(Date.now() / 1000) - 1_700_000_000;
  // a parameter value is quoted, so it may not contain quotes or line breaks
  const fromName = (process.env.MAIL_FROM_NAME ?? "Meska AI").replace(/["\r\n]/g, "");
  const organizer = process.env.GMAIL_USER ? [`ORGANIZER;CN="${fromName}":mailto:${process.env.GMAIL_USER}`] : [];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meska AI//Meska Company Brain//EN",
    "CALSCALE:GREGORIAN",
    cancelled ? "METHOD:CANCEL" : "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@meska-trainers`,
    `SEQUENCE:${sequence}`,
    ...organizer,
    ...(cancelled ? ["STATUS:CANCELLED"] : []),
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(trainerTitle(b))}`,
    `LOCATION:${esc(b.location ?? "")}`,
    `DESCRIPTION:${esc(`${b.content ? `${b.content}\n\n` : ""}Details: ${link}`)}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT12H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Meska AI training tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(b: B, link: string) {
  const start = cairoStart(b.date, b.start_time);
  const end = cairoStart(b.date, b.end_time);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: trainerTitle(b),
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `${b.content ? `${b.content}\n\n` : ""}Details: ${link}`,
    location: b.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
