export type Step = {
  kicker: string;
  tex: string[];
  note: string;
};

export const lifecycle: Step[] = [
  {
    kicker: "00 — the recording",
    tex: ["\\text{clip} = (\\text{video},\\ \\text{sensors},\\ \\text{physics})"],
    note: "Pyros runs a scripted pick-up in MuJoCo with random friction, grip force and payload, so the cup slips at a different moment every time. Video and sensor streams are public. The physics log stays private.",
  },
  {
    kicker: "01 — the commitment",
    tex: ["r = \\mathrm{Merkle}\\big(\\,(\\text{clipId},\\ \\mathrm{keccak}(\\text{physics}))\\,\\big)"],
    note: "Before anyone plays, the engineer locks the USDC budget in TaskEscrow together with this root. The task is committed to its answers, so they cannot change after the fact.",
  },
  {
    kicker: "02 — the lease",
    tex: ["\\ell \\le 60\\,\\text{s}, \\quad \\text{dwell} \\ge 3\\,\\text{s}"],
    note: "A phone gets one clip at a time with a short lease. The contributor watches the arm and the contact-force line together. Answers faster than a person could watch are rejected.",
  },
  {
    kicker: "03 — the mark",
    tex: ["\\hat t = \\text{video.currentTime}"],
    note: "The contributor scrubs to the moment the grasp failed and marks it. The mark comes from the video clock, not the wall clock, so a slow phone cannot drift the answer.",
  },
  {
    kicker: "04 — the check",
    tex: ["|\\hat t - t^{\\star}| \\le 0.15\\,\\text{s}"],
    note: "Each verifier node looks up t*, the exact moment contact was lost, in its own copy of the physics log. No voting, no reviewer. Physics is the reviewer.",
  },
  {
    kicker: "05 — the score",
    tex: ["s = 10000 \\left(1 - \\dfrac{|\\hat t - t^{\\star}|}{0.15}\\right)"],
    note: "Closer marks score higher. The score goes on chain and becomes the label's quality weight in the dataset. A miss comes back with a reason: you marked 3.71 s, contact dropped at 3.21 s.",
  },
  {
    kicker: "06 — two of three",
    tex: ["\\big|\\{\\, i : \\mathrm{sig}_i \\text{ valid},\\ \\text{staked}_i \\,\\}\\big| \\ge 2"],
    note: "Three Pyros nodes, each with its own key and its own TRACE stake, sign the same EIP-712 attestation. The chain accepts it only with two distinct staked signers. One node can go down and payouts continue.",
  },
  {
    kicker: "07 — record, pay, mint",
    tex: ["\\text{record}(a, \\sigma) \\Rightarrow \\text{USDC} + \\text{token} + \\text{stats}"],
    note: "One Monad transaction records the attempt, pays the contributor from escrow, mints dataset tokens and updates reputation. A relayer pays the gas. The contributor never touches a wallet.",
  },
  {
    kicker: "08 — the dataset token",
    tex: ["\\text{supply} = 2 \\times \\text{verified contributions}"],
    note: "Every verified annotation mints one token to the contributor and one to the engineer who funded the task. Payouts write per-contributor state, so different contributors settle in parallel on Monad.",
  },
  {
    kicker: "09 — the license",
    tex: ["\\text{share}_h = \\text{fee} \\times \\dfrac{\\text{balance}_h}{\\text{supply}}"],
    note: "A lab licenses the dataset in USDC. The vault distributes the fee in constant gas, and every holder claims a pro-rata share whenever they like.",
  },
];

export const phrases = [
  "physics log.",
  "contact lost.",
  "failure moment.",
  "torque spike.",
  "two of three.",
  "verifier stake.",
  "EIP-712 attestation.",
  "record, pay, mint.",
  "dataset token.",
  "pro-rata license.",
  "burner address.",
  "settled on Monad.",
];
