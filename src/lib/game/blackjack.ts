// Classic blackjack: 6-deck shoe, dealer peeks for blackjack, dealer stands
// on soft 17, blackjack pays 3:2, double on any two cards, one split.

export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { rank: Rank; suit: Suit };

export type HandResult = "blackjack" | "win" | "push" | "lose" | "bust";

export type Hand = {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  result?: HandResult;
  /** Prize Points earned by this hand (winnings beyond the returned stake). */
  winnings?: number;
};

export type Phase = "idle" | "player" | "settled";

export type BlackjackState = {
  phase: Phase;
  shoe: Card[];
  dealer: Card[];
  hands: Hand[];
  active: number;
};

export type Action = "hit" | "stand" | "double" | "split";

export const RULES = {
  decks: 6,
  reshuffleBelow: 78, // ~75% penetration
  blackjackPays: 1.5,
  dealerHitsSoft17: false,
  maxHands: 2,
} as const;

const SUITS: Suit[] = ["S", "H", "D", "C"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function newShoe(randomInt: (max: number) => number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < RULES.decks; d++)
    for (const suit of SUITS) for (const rank of RANKS) shoe.push({ rank, suit });
  // Fisher–Yates with a cryptographic RNG supplied by the caller.
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

const cardValue = (c: Card) =>
  c.rank === "A" ? 11 : ["J", "Q", "K"].includes(c.rank) ? 10 : Number(c.rank);

export function handValue(cards: Card[]) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (hand: Pick<Hand, "cards" | "fromSplit">) =>
  !hand.fromSplit && hand.cards.length === 2 && handValue(hand.cards).total === 21;

export function initialState(): BlackjackState {
  return { phase: "idle", shoe: [], dealer: [], hands: [], active: 0 };
}

function draw(state: BlackjackState): Card {
  const card = state.shoe.pop();
  if (!card) throw new Error("Shoe is empty");
  return card;
}

/** Actions the active hand may take, given the player's spare Tickets. */
export function allowedActions(state: BlackjackState, spareTickets: number): Action[] {
  if (state.phase !== "player") return [];
  const hand = state.hands[state.active];
  if (!hand || hand.done) return [];
  const actions: Action[] = ["hit", "stand"];
  const firstTwo = hand.cards.length === 2;
  if (firstTwo && spareTickets >= hand.bet) {
    actions.push("double");
    if (
      state.hands.length < RULES.maxHands &&
      cardValue(hand.cards[0]) === cardValue(hand.cards[1])
    ) {
      actions.push("split");
    }
  }
  return actions;
}

export function deal(
  state: BlackjackState,
  bet: number,
  randomInt: (max: number) => number,
): BlackjackState {
  const shoe = state.shoe.length < RULES.reshuffleBelow ? newShoe(randomInt) : state.shoe;
  const next: BlackjackState = {
    phase: "player",
    shoe: [...shoe],
    dealer: [],
    hands: [{ cards: [], bet, doubled: false, fromSplit: false, done: false }],
    active: 0,
  };
  next.hands[0].cards.push(draw(next));
  next.dealer.push(draw(next));
  next.hands[0].cards.push(draw(next));
  next.dealer.push(draw(next));

  // Dealer peeks when showing an Ace or ten-value card.
  const dealerBj = isBlackjack({ cards: next.dealer, fromSplit: false });
  if (dealerBj || isBlackjack(next.hands[0])) return settle(next);
  return next;
}

export function act(state: BlackjackState, action: Action): BlackjackState {
  const next: BlackjackState = structuredClone(state);
  const hand = next.hands[next.active];

  switch (action) {
    case "hit":
      hand.cards.push(draw(next));
      if (handValue(hand.cards).total >= 21) hand.done = true;
      break;
    case "stand":
      hand.done = true;
      break;
    case "double":
      hand.bet *= 2;
      hand.doubled = true;
      hand.cards.push(draw(next));
      hand.done = true;
      break;
    case "split": {
      const [first, second] = hand.cards;
      const splitAces = first.rank === "A";
      const a: Hand = { cards: [first, draw(next)], bet: hand.bet, doubled: false, fromSplit: true, done: splitAces };
      const b: Hand = { cards: [second, draw(next)], bet: hand.bet, doubled: false, fromSplit: true, done: splitAces };
      next.hands.splice(next.active, 1, a, b);
      for (const h of [a, b]) if (handValue(h.cards).total === 21) h.done = true;
      break;
    }
  }

  const pending = next.hands.findIndex((h) => !h.done);
  if (pending !== -1) {
    next.active = pending;
    return next;
  }
  return playDealerAndSettle(next);
}

function playDealerAndSettle(state: BlackjackState): BlackjackState {
  const live = state.hands.some((h) => handValue(h.cards).total <= 21);
  if (live) {
    for (;;) {
      const { total, soft } = handValue(state.dealer);
      if (total < 17 || (total === 17 && soft && RULES.dealerHitsSoft17)) {
        state.dealer.push(draw(state));
      } else break;
    }
  }
  return settle(state);
}

function settle(state: BlackjackState): BlackjackState {
  const dealer = handValue(state.dealer).total;
  const dealerBj = isBlackjack({ cards: state.dealer, fromSplit: false });

  for (const hand of state.hands) {
    const player = handValue(hand.cards).total;
    const playerBj = isBlackjack(hand);
    let result: HandResult;
    if (player > 21) result = "bust";
    else if (playerBj && dealerBj) result = "push";
    else if (playerBj) result = "blackjack";
    else if (dealerBj) result = "lose";
    else if (dealer > 21 || player > dealer) result = "win";
    else if (player === dealer) result = "push";
    else result = "lose";

    hand.result = result;
    hand.done = true;
    hand.winnings =
      result === "blackjack" ? hand.bet * RULES.blackjackPays : result === "win" ? hand.bet : 0;
  }
  state.phase = "settled";
  return state;
}

/** State safe to send to the browser: no shoe, dealer hole card hidden mid-hand. */
export type PublicBlackjackState = {
  phase: Phase;
  dealer: (Card | null)[];
  dealerTotal: number | null;
  hands: (Omit<Hand, "done"> & { total: number; soft: boolean; done: boolean })[];
  active: number;
  shoeRemaining: number;
};

export function toPublic(state: BlackjackState): PublicBlackjackState {
  const hideHole = state.phase === "player";
  const dealer = hideHole ? [state.dealer[0], null] : state.dealer;
  return {
    phase: state.phase,
    dealer,
    dealerTotal: hideHole
      ? handValue(state.dealer.slice(0, 1)).total
      : state.dealer.length
        ? handValue(state.dealer).total
        : null,
    hands: state.hands.map((h) => ({ ...h, ...handValue(h.cards) })),
    active: state.active,
    shoeRemaining: state.shoe.length,
  };
}
