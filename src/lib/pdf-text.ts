// The profile PDF embeds Latin-only fonts (DM Sans, Merriweather). Characters outside their
// coverage would print as blanks, so common symbols get plain equivalents and the rest is left out.
const REPLACE: Record<string, string> = { "→": "->", "←": "<-", "⇒": "=>", "✓": "-", "✔": "-", "✅": "-", "★": "*", "☆": "*", "▪": "•", "■": "•", "●": "•", "◦": "•", "·": "·" };

// Mirrors the fonts' "latin" subset.
const UNPRINTABLE = /[^\u0000-ÿıŒœʻʼˆ˚˜̄̈ -⁯€™↑↓−∕]/gu;

const mapped = (s: string) => [...s].map((ch) => REPLACE[ch] ?? ch).join("");

export function pdfText(s: string) {
  const m = mapped(s);
  const kept = m.replace(UNPRINTABLE, "");
  // where words were dropped, don't leave a run of spaces behind
  return kept === m ? m : kept.replace(/[ \t]{2,}/g, " ");
}

// True when part of the text can't appear in the PDF (e.g. Arabic), so the editor can be told.
export function hasUnprintable(s: string | null | undefined) {
  if (!s) return false;
  return new RegExp(UNPRINTABLE.source, "u").test(mapped(s));
}
