import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Internship Compass — editable internship board with free AI matching",
  description:
    "Browse and edit internships (type, location, skills, ...) and let the free Pollinations.ai LLM score candidates and rank the best fits.",
};

const nav = [
  { href: "/", label: "Find my internship" },
  { href: "/manage", label: "Manage internships" },
  { href: "/recruit", label: "Rank candidates" },
  { href: "/about", label: "How it works" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070b14]/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-sky-500 text-lg font-black text-white">
                ◆
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-white">Internship Compass</span>
                <span className="block text-[11px] text-slate-400">
                  editable board + free AI matching
                </span>
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <a
              className="ml-auto hidden rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 sm:block"
              href="https://pollinations.ai"
              target="_blank"
              rel="noreferrer"
            >
              LLM by Pollinations.ai ↗
            </a>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-slate-500 sm:px-6">
          <p>
            Scores are produced by a free LLM (Pollinations.ai) and a transparent local
            overlap check. Always let a human make the final hiring decision.
          </p>
        </footer>
      </body>
    </html>
  );
}
