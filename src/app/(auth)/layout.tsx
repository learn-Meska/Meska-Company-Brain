export default function AuthLayout({ children, heading = "Meska Training Center" }: { children: React.ReactNode; heading?: string }) {
  return (
    <div className="brand-gradient relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div className="brand-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -right-32 -top-40 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(91,141,239,.45),transparent_65%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-4 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-white-text.png" alt="Meska AI" className="h-10 w-auto" />
          <span className="kicker">Programs, Learning &amp; Delivery</span>
          <div className="text-center text-[28px] font-bold leading-tight tracking-tight">{heading}</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">{children}</div>
        <p className="mt-6 text-center text-xs text-[#93C5FD]">© 2026 Meska AI — Confidential</p>
      </div>
    </div>
  );
}
