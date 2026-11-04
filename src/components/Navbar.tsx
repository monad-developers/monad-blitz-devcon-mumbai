"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./Logo";

// Placeholder nav — swap labels/links here once the final nav is decided.
const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Payouts", href: "#payouts" },
  { label: "Why Morney", href: "#why-morney" },
  { label: "Risk", href: "#risk" },
  { label: "Roadmap", href: "#roadmap" },
];

const EXTERNAL_LINKS = [{ label: "Docs", href: "#" }];

const LAUNCH_HREF = "/app";

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled || open
          ? "border-line bg-background/75 backdrop-blur-xl"
          : "border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Morney home">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-8 font-mono text-[13px] uppercase tracking-[0.08em] md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-foreground/65 transition-colors hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
          <span className="h-5 w-px bg-line" />
          {EXTERNAL_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="flex items-center gap-1 text-foreground/65 transition-colors hover:text-primary"
            >
              {l.label}
              <ArrowUpRight className="size-3.5" />
            </a>
          ))}
          <a
            href={LAUNCH_HREF}
            className="flex items-center gap-1.5 bg-primary px-5 py-2.5 text-white transition-[background-color,transform] hover:bg-foreground active:scale-[0.97]"
          >
            Launch App
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>

        <button
          type="button"
          className="flex size-10 items-center justify-center md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
          >
            {open ? (
              <path d="M6 6l12 12M18 6 6 18" />
            ) : (
              <path d="M4 8h16M4 16h16" />
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-line px-4 pb-6 font-mono uppercase tracking-[0.08em] md:hidden">
          {[...NAV_LINKS, ...EXTERNAL_LINKS].map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block border-b border-line py-4 text-foreground/80"
            >
              {l.label}
            </a>
          ))}
          <a
            href={LAUNCH_HREF}
            className="mt-6 flex items-center justify-center gap-1.5 bg-primary py-3 text-white"
          >
            Launch App
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      )}
    </header>
  );
}
