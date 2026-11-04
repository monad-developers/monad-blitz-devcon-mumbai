type LogoMarkProps = {
  className?: string;
  title?: string;
};

// Vector redraw of the Morney "m" mark: two overlapping arches and a coin dot.
export function LogoMark({ className, title = "Morney" }: LogoMarkProps) {
  return (
    <svg
      viewBox="170 183 263 199"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
    >
      <path
        d="M302 382V259a55 55 0 0 1 110 0v123"
        stroke="var(--logo-b)"
        strokeWidth="42"
      />
      <path
        d="M191 382V259a55 55 0 0 1 110 0v123"
        stroke="var(--logo-a)"
        strokeWidth="42"
      />
      <circle cx="357" cy="340" r="17" fill="var(--logo-b)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark className="h-6 w-auto" />
      <span className="font-display text-[17px] tracking-tight">
        <span className="font-bold">MOR</span>
        <span className="font-light">NEY</span>
      </span>
    </span>
  );
}
