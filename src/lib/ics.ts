import { cairoStart, trainerTitle } from "./format";

type B = { id: string; program_name: string; day_number: number; date: string; start_time: string; end_time: string; location: string | null; content: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545 lines must be folded at 75 octets
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

// Calendar event for the trainer (title follows the 2-day program-name rule).
export function trainingIcs(b: B, link: string) {
  const start = cairoStart(b.date, b.start_time);
  const end = cairoStart(b.date, b.end_time);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meska AI//Meska Training Center//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@meska-trainers`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(trainerTitle(b))}`,
    `LOCATION:${esc(b.location ?? "")}`,
    `DESCRIPTION:${esc(`${b.content}\n\nDetails: ${link}`)}`,
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
    details: `${b.content}\n\nDetails: ${link}`,
    location: b.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
