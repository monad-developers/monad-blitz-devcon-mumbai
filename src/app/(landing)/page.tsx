import { GlyphField } from "@/components/GlyphField";
import { LogoMark, Wordmark } from "@/components/Logo";
import { ArrowUpRight, Navbar } from "@/components/Navbar";

const HERO_STATS = [
  { label: "Prize pool", value: "95% of yield" },
  { label: "Platform fee", value: "5% of yield" },
  { label: "Principal wagered", value: "$0" },
];

const STEPS = [
  {
    title: "Deposit",
    body: "Deposit USDC into the Morney vault. The planned integration supplies it to Aave on Monad, where borrower interest generates variable yield.",
  },
  {
    title: "Get Tickets",
    body: "Receive a daily Ticket allowance based on your eligible balance and time deposited. Tickets are play credits, not a claim on USDC.",
  },
  {
    title: "Play",
    body: "Choose how to play. Experiences may include arcade games, casino-style games, and daily prediction challenges. The initial lineup is still being selected.",
  },
  {
    title: "Earn Points",
    body: "Eligible results award Prize Points under published scoring rules, on per-game and shared daily leaderboards.",
  },
  {
    title: "Get Paid",
    body: "Morney takes 5% of the day's yield. The other 95% is split by each player's share of eligible Prize Points.",
  },
];

const DIFFERENTIATORS = [
  {
    kicker: "Shared vault",
    title: "Flexible play",
    body: "A shared savings vault with a flexible gaming experience. Choose how you participate while competing for the same daily reward pool.",
  },
  {
    kicker: "Aligned revenue",
    title: "5% of yield",
    body: "Platform revenue is a 5% share of generated yield, aligned with the vault's earning activity.",
  },
  {
    kicker: "No wagering",
    title: "No Ticket purchases",
    body: "The core model doesn't require you to buy Tickets or wager your deposits.",
  },
];

const PROTECTED = [
  "Principal never funds game losses, prizes, or the platform fee",
  "Losing a game costs Tickets, not savings",
  "No need to buy Tickets or wager deposits",
];

const RISKS = [
  "Lending-protocol, smart-contract, stablecoin, and liquidity risk",
  "Withdrawals depend on vault rules and underlying liquidity",
  "You give up your direct share of lending yield to join the rewards",
  "Yield and individual rewards are not guaranteed",
];

const HACKATHON_SCOPE = [
  "Savings vault",
  "Daily Tickets",
  "One game",
  "Daily reward distribution",
];

const TRADE_EXAMPLE = [
  { label: "Trading margin", value: "$100" },
  { label: "Leverage", value: "5×" },
  { label: "Position size", value: "$500" },
  { label: "Tickets accrue on", value: "$100" },
];

const primaryButton =
  "inline-flex items-center gap-2 bg-primary px-6 py-3.5 font-mono text-sm uppercase tracking-[0.08em] text-white shadow-[0_8px_30px_-8px_rgba(110,84,255,0.6)] transition-[background-color,transform] hover:bg-foreground active:scale-[0.97]";

export default function Home() {
  return (
    <>
      <GlyphField />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-40 -top-40 -z-10 size-[42rem] rounded-full bg-primary-soft/70 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-60 -left-40 -z-10 size-[36rem] rounded-full bg-cyan/20 blur-[140px]"
      />
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative mx-auto flex min-h-svh max-w-[1400px] flex-col justify-center px-4 pb-16 pt-28 sm:px-6">
          <p className="rise mb-8 inline-flex w-fit items-center gap-2 border border-primary/25 bg-background/70 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-primary backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Built on Monad · Blitz Mumbai
          </p>

          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-display text-[clamp(2.6rem,7.4vw,7rem)] font-medium uppercase leading-[0.98] tracking-[-0.03em]">
                <span className="rise block">Save more.</span>
                <span className="rise block [animation-delay:120ms]">
                  Play more.
                </span>
                <span className="rise slice-text block pr-[0.1em] italic [animation-delay:240ms]">
                  Compete for daily rewards
                </span>
              </h1>

              <p className="rise mt-8 max-w-xl text-lg leading-relaxed text-muted [animation-delay:380ms]">
                Morney turns the yield from your savings into daily gaming
                rewards. Deposit USDC, receive Tickets, and play to earn Prize
                Points. Losing a game never deducts your savings principal.
              </p>

              <div className="rise mt-10 flex flex-wrap gap-3 [animation-delay:480ms]">
                <a href="/app" className={primaryButton}>
                  Start saving
                  <ArrowUpRight className="size-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 border border-foreground/15 bg-background/60 px-6 py-3.5 font-mono text-sm uppercase tracking-[0.08em] text-foreground/80 backdrop-blur transition-colors hover:border-primary hover:text-primary"
                >
                  How it works
                </a>
              </div>
            </div>

            <dl className="rise grid shrink-0 grid-cols-3 gap-6 border-t border-line pt-6 [animation-delay:600ms] lg:flex lg:flex-col lg:gap-10 lg:border-t-0 lg:pt-0 lg:text-right">
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                    {s.label}
                  </dt>
                  <dd className="mt-1.5 whitespace-nowrap font-display text-lg font-medium tabular-nums sm:text-2xl">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-24 sm:px-6"
        >
          <SectionLabel index="01" label="How it works" />
          <h2 className="mt-6 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.75rem)] font-medium uppercase leading-[1.02] tracking-[-0.03em]">
            Savings determine access.
            <span className="text-muted/70"> Results determine rewards.</span>
          </h2>

          <ol className="mt-16 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="group relative border-b border-r border-line bg-background/70 p-6 backdrop-blur-sm transition-colors hover:bg-primary-soft/40 lg:min-h-72"
              >
                <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />
                <span className="font-mono text-sm text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-10 font-display text-2xl font-medium uppercase tracking-tight lg:mt-24">
                  {step.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Payouts */}
        <section
          id="payouts"
          className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-24 sm:px-6"
        >
          <SectionLabel index="02" label="Daily payouts" />
          <div className="mt-6 grid gap-16 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-[clamp(2rem,4.4vw,3.75rem)] font-medium uppercase leading-[1.02] tracking-[-0.03em]">
                No jackpot draw.
                <span className="slice-text block italic">Just points.</span>
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
                Morney takes a 5% platform fee from the day&apos;s generated
                yield. The remaining 95% forms the daily prize pool, shared in
                proportion to eligible Prize Points — rewards come from points,
                not a separate random jackpot draw.
              </p>
              <pre className="mt-10 overflow-x-auto border border-line bg-surface/80 p-5 font-mono text-sm leading-relaxed text-foreground/85 backdrop-blur">
                <span className="text-muted">{"// player reward\n"}</span>
                reward = dailyPrizePool × <span className="text-primary">yourEligiblePoints</span>
                {"\n"}
                {"         ÷ totalEligiblePoints"}
              </pre>
              <p className="mt-4 max-w-lg font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-muted">
                Payouts depend on actual available yield and settled results.
                Unresolved predictions count toward a later payout cycle.
              </p>
            </div>

            <div className="grid-lines relative border border-line bg-background/80 p-6 shadow-[0_30px_80px_-40px_rgba(110,84,255,0.45)] backdrop-blur-sm sm:p-8">
              <Corners />
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                Example day
              </p>
              <p className="mt-3 font-display text-5xl font-medium tabular-nums tracking-tight sm:text-6xl">
                $100.00
              </p>
              <p className="mt-1 text-muted">yield generated by the vault</p>

              <div className="mt-10 flex h-3 w-full gap-0.5 overflow-hidden">
                <div className="h-full w-[95%] bg-gradient-to-r from-primary to-[#a594ff]" />
                <div className="h-full w-[5%] bg-foreground" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="flex items-center gap-2 text-muted">
                    <span className="size-2 bg-primary" /> Prize pool
                  </p>
                  <p className="mt-1 font-display text-xl font-medium tabular-nums">
                    $95.00
                  </p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-2 text-muted">
                    <span className="size-2 bg-foreground" /> Platform fee
                  </p>
                  <p className="mt-1 font-display text-xl font-medium tabular-nums">
                    $5.00
                  </p>
                </div>
              </div>

              <div className="mt-10 flex items-end justify-between border-t border-line pt-6">
                <div>
                  <p className="text-muted">You hold 10% of today&apos;s eligible Prize Points</p>
                  <p className="mt-1 font-mono text-sm text-muted">$95.00 × 10%</p>
                </div>
                <p className="font-display text-4xl font-medium tabular-nums text-primary">
                  $9.50
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What makes Morney different */}
        <section
          id="why-morney"
          className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-24 sm:px-6"
        >
          <SectionLabel index="03" label="What makes Morney different" />
          <h2 className="mt-6 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.75rem)] font-medium uppercase leading-[1.02] tracking-[-0.03em]">
            One shared vault.
            <span className="slice-text block italic">Your way to play.</span>
          </h2>

          <div className="mt-16 grid border-l border-t border-line md:grid-cols-3">
            {DIFFERENTIATORS.map((d) => (
              <div
                key={d.title}
                className="border-b border-r border-line bg-background/70 p-6 backdrop-blur-sm sm:p-8"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                  {d.kicker}
                </p>
                <h3 className="mt-6 font-display text-2xl font-medium uppercase tracking-tight">
                  {d.title}
                </h3>
                <p className="mt-3 leading-relaxed text-muted">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Principal & risk */}
        <section
          id="risk"
          className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-24 sm:px-6"
        >
          <SectionLabel index="04" label="Principal & risk" />
          <h2 className="mt-6 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.75rem)] font-medium uppercase leading-[1.02] tracking-[-0.03em]">
            Your savings stay out of the game.
            <span className="text-muted/70"> Not out of the market.</span>
          </h2>

          <div className="mt-16 grid border-l border-t border-line md:grid-cols-2">
            <RiskList
              title="Protected by design"
              tone="primary"
              items={PROTECTED}
            />
            <RiskList title="Still exposed to" tone="muted" items={RISKS} />
          </div>
        </section>

        {/* Roadmap */}
        <section
          id="roadmap"
          className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-24 sm:px-6"
        >
          <SectionLabel index="05" label="Roadmap" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="relative border border-line bg-background/80 p-6 backdrop-blur-sm sm:p-8">
              <Corners />
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                Now · Monad Blitz Mumbai
              </p>
              <h3 className="mt-4 font-display text-3xl font-medium uppercase tracking-[-0.02em]">
                Hackathon scope
              </h3>
              <ul className="mt-8 divide-y divide-line border-y border-line">
                {HACKATHON_SCOPE.map((item, i) => (
                  <li key={item} className="flex items-center gap-4 py-3.5">
                    <span className="font-mono text-xs text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid-lines relative border border-line bg-background/80 p-6 backdrop-blur-sm sm:p-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                Next · Future roadmap
              </p>
              <h3 className="mt-4 font-display text-3xl font-medium uppercase tracking-[-0.02em]">
                Morney <span className="slice-text italic">Trade</span>
              </h3>
              <p className="mt-4 max-w-xl leading-relaxed text-muted">
                A long-and-short trading mode where eligible collateral earns
                Tickets over time — usable across Morney&apos;s games while you
                manage your positions.
              </p>

              <dl className="mt-8 grid grid-cols-2 border-l border-t border-line sm:grid-cols-4">
                {TRADE_EXAMPLE.map((s) => (
                  <div
                    key={s.label}
                    className="border-b border-r border-line bg-background/70 p-4"
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                      {s.label}
                    </dt>
                    <dd className="mt-1 font-display text-2xl font-medium tabular-nums">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-6 border-l-2 border-primary pl-4 text-sm leading-relaxed text-foreground/80">
                Tickets are an additional reward — not protection against
                trading losses. Margin stays exposed to fees, funding, and
                liquidation. The same funds count only once — moving savings
                into margin doesn&apos;t earn duplicate allocations.
              </p>
              <p className="mt-4 font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-muted">
                Margin doesn&apos;t automatically earn lending yield. Morney
                Trade needs an exchange integration that supports yield-bearing
                collateral, or a separate budget to fund trading rewards.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-6">
          <div className="relative overflow-hidden bg-foreground px-6 py-16 text-white sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-32 size-[28rem] rounded-full bg-primary/50 blur-[100px]"
            />
            <LogoMark className="pointer-events-none absolute -bottom-10 -right-6 h-64 w-auto opacity-30 sm:h-80" />
            <h2 className="relative font-display text-[clamp(2rem,5vw,4.5rem)] font-medium uppercase leading-[1] tracking-[-0.03em]">
              <span className="block">Keep savings productive.</span>
              <span className="block">Use Tickets to play.</span>
              <span className="block italic text-primary-soft">
                Compete for daily yield.
              </span>
            </h2>
            <p className="relative mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Morney&apos;s vision is to make saving more engaging — more and
              more money for our users.
            </p>
            <a
              href="/app"
              className="relative mt-10 inline-flex items-center gap-2 bg-primary px-6 py-3.5 font-mono text-sm uppercase tracking-[0.08em] text-white transition-[background-color,color,transform] hover:bg-white hover:text-foreground active:scale-[0.97]"
            >
              Launch App
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark className="text-foreground" />
          <p className="font-mono text-xs uppercase tracking-[0.08em]">
            Built on Monad · Monad Blitz Mumbai · Yield and rewards are not
            guaranteed
          </p>
        </div>
      </footer>
    </>
  );
}

function SectionLabel({ index, label }: { index: string; label: string }) {
  return (
    <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-muted">
      <span className="text-primary">{index}</span>
      <span className="h-px w-8 bg-primary/40" />
      {label}
    </p>
  );
}

function RiskList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "primary" | "muted";
  items: string[];
}) {
  return (
    <div
      className={`border-b border-r border-line p-6 backdrop-blur-sm sm:p-8 ${
        tone === "primary" ? "bg-primary-soft/30" : "bg-background/70"
      }`}
    >
      <p
        className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
          tone === "primary" ? "text-primary" : "text-muted"
        }`}
      >
        {title}
      </p>
      <ul className="mt-6 space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 leading-relaxed">
            <span
              className={`mt-2.5 size-1.5 shrink-0 ${
                tone === "primary" ? "bg-primary" : "bg-foreground/40"
              }`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// HUD-style corner ticks for a futuristic panel frame.
function Corners() {
  const base = "pointer-events-none absolute size-3 border-primary";
  return (
    <>
      <span className={`${base} -left-px -top-px border-l-2 border-t-2`} />
      <span className={`${base} -right-px -top-px border-r-2 border-t-2`} />
      <span className={`${base} -bottom-px -left-px border-b-2 border-l-2`} />
      <span className={`${base} -bottom-px -right-px border-b-2 border-r-2`} />
    </>
  );
}
