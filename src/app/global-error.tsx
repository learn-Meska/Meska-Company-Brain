"use client";

// Last resort when the root layout itself fails; it can't rely on the app's stylesheet.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B1E3A", fontFamily: "Poppins, Segoe UI, Arial, sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px", color: "#1A2436" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#5E6B82", margin: "0 0 18px" }}>Meska Training Center couldn&apos;t load. Please try again.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#2563EB", color: "#fff", border: 0, borderRadius: 999, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
