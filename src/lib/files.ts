// Training materials, briefs and content: documents, slides, sheets, images, audio/video and archives.
// Anything that a browser or OS would run (html, svg, exe, scripts…) is refused.
export const FILE_TYPES = /\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|rtf|odt|odp|ods|key|pages|numbers|png|jpe?g|gif|webp|heic|mp4|mov|m4v|webm|mp3|m4a|wav|zip)$/i;

export const safeName = (fileName: string) => String(fileName).replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").slice(-120) || "file";

export function checkFile(fileName: string) {
  if (typeof fileName !== "string" || !FILE_TYPES.test(fileName.trim())) return "That file type isn't allowed. Upload documents, slides, sheets, images, audio/video or a .zip.";
  return null;
}

// The name a browser saves a download under: the saved name if it is plain and allowed, else the stored object's own name.
// Keeps non-Latin names (e.g. Arabic) and drops only characters that are unsafe in a file name.
export function downloadName(fileName: string, path: string) {
  const stored = path.split("/").pop()!;
  return checkFile(fileName) ? stored : fileName.replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, "_").trim() || stored;
}
