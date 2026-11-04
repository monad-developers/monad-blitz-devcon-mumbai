// On-chain adapter for the Roulette and Blackjack screens.
// The screens keep the same API, but every call now reads or writes the Monad Testnet contracts through MetaMask.
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseAbi,
  parseEventLogs,
  type Address,
  type EIP1193Provider,
} from "viem";
import { monadTestnet } from "viem/chains";

import deployment from "@/contracts/deployment.json";
import type { Action, Card, HandResult, PublicBlackjackState, Rank, Suit } from "@/lib/game/blackjack";
import { colorOf, PAYOUTS, type PocketColor, type RouletteBet, type SettledBet } from "@/lib/game/roulette";

export type PlayerSummary = {
  tickets: number;
  prizePoints: number;
  dailyAllowance: number;
  resetsAt: string;
  rules: { pointsPerTicketWon: number; minBet: number; maxBetPerRound: number };
};

export type RouletteState = { player: PlayerSummary; history: number[] };

export type SpinResponse = RouletteState & {
  result: { number: number; color: PocketColor };
  bets: SettledBet[];
  totalStaked: number;
  ticketsReturned: number;
  pointsWon: number;
};

export type BlackjackView = {
  game: PublicBlackjackState;
  allowedActions: Action[];
  player: PlayerSummary;
  pointsWon?: number;
};

const vaultAbi = parseAbi([
  "function ticketsOf(address user) view returns (uint256)",
  "function ticketsPerDayOf(address user) view returns (uint256)",
  "function dayEndsAt() view returns (uint256)",
]);
const rouletteAbi = parseAbi([
  "function spin(uint8 bet, uint8 pick, uint256 tickets) returns (uint8 result, uint256 ticketsWon)",
  "event Spun(address indexed player, uint8 bet, uint8 pick, uint256 tickets, uint8 result, uint256 ticketsWon)",
]);
const blackjackAbi = parseAbi([
  "function deal(uint256 tickets)",
  "function hit()",
  "function stand()",
  "function getHand(address player) view returns (uint256 tickets, uint8[] playerCards, uint8[] dealerCards, bool active, uint8 playerTotal, uint8 dealerTotal)",
]);

const VAULT = deployment.contracts.SmemVault.address as Address;
const ROULETTE = deployment.casino.TicketRoulette.address as Address;
const BLACKJACK = deployment.casino.TicketBlackjack.address as Address;

const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

// Roulette bet kinds that the contract supports, mapped to its bet codes.
const BET_CODE: Partial<Record<RouletteBet["kind"], number>> = {
  straight: 0,
  red: 1,
  black: 2,
  odd: 3,
  even: 4,
  low: 5,
  high: 6,
};

const history: number[] = [];

async function wallet() {
  const eth = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (!eth) throw new Error("Install MetaMask to play on Monad Testnet.");
  const client = createWalletClient({ chain: monadTestnet, transport: custom(eth) });
  let [account] = await client.getAddresses();
  if (!account) [account] = await client.requestAddresses();
  if ((await client.getChainId()) !== monadTestnet.id) {
    try {
      await client.switchChain({ id: monadTestnet.id });
    } catch {
      await client.addChain({ chain: monadTestnet });
    }
  }
  return { client, account };
}

async function player(account: Address): Promise<PlayerSummary> {
  const [tickets, perDay, endsAt] = await Promise.all([
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "ticketsOf", args: [account] }),
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "ticketsPerDayOf", args: [account] }),
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: "dayEndsAt" }),
  ]);
  return {
    tickets: Math.floor(Number(formatUnits(tickets, 18))),
    prizePoints: 0,
    dailyAllowance: Number(formatUnits(perDay, 18)),
    resetsAt: new Date(Number(endsAt) * 1000).toISOString(),
    rules: { pointsPerTicketWon: 1, minBet: 1, maxBetPerRound: 1_000_000 },
  };
}

async function send(write: Promise<`0x${string}`>) {
  const hash = await write;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");
  return receipt;
}

// ---------------------------------------------------------------------------
// Blackjack: map the contract's hand to the screen's state.
// ---------------------------------------------------------------------------

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["S", "H", "D", "C"];
const toCard = (value: number, i: number): Card => ({ rank: RANKS[value - 1], suit: SUITS[(value + i) % 4] });

function soft(cards: readonly number[]) {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === 1) {
      aces++;
      sum += 11;
    } else sum += c > 10 ? 10 : c;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return aces > 0 && sum <= 21;
}

async function blackjackView(account: Address): Promise<BlackjackView> {
  const [tickets, playerCards, dealerCards, active, p, d] = await publicClient.readContract({
    address: BLACKJACK,
    abi: blackjackAbi,
    functionName: "getHand",
    args: [account],
  });
  const bet = Number(tickets);
  const started = playerCards.length > 0;
  let result: HandResult | undefined;
  let winnings = 0;
  if (started && !active) {
    const natural = p === 21 && playerCards.length === 2;
    const dealerNatural = d === 21 && dealerCards.length === 2;
    if (p > 21) result = "bust";
    else if (natural && !dealerNatural) [result, winnings] = ["blackjack", bet * 1.5];
    else if (d > 21 || p > d) [result, winnings] = ["win", bet];
    else if (p === d) result = "push";
    else result = "lose";
  }
  const game: PublicBlackjackState = {
    phase: !started ? "idle" : active ? "player" : "settled",
    dealer: active ? [toCard(dealerCards[0], 0), null] : dealerCards.map(toCard),
    dealerTotal: started ? d : null,
    hands: started
      ? [
          {
            cards: playerCards.map(toCard),
            bet,
            doubled: false,
            fromSplit: false,
            done: !active,
            result,
            winnings,
            total: p,
            soft: soft(playerCards),
          },
        ]
      : [],
    active: 0,
    shoeRemaining: 52,
  };
  return { game, allowedActions: active ? ["hit", "stand"] : [], player: await player(account), pointsWon: winnings };
}

// ---------------------------------------------------------------------------
// API used by the screens
// ---------------------------------------------------------------------------

export const api = {
  async roulette(): Promise<RouletteState> {
    const { account } = await wallet();
    return { player: await player(account), history: [...history] };
  },

  async spin(bets: RouletteBet[]): Promise<SpinResponse> {
    if (bets.length !== 1) throw new Error("On chain, place one bet per spin.");
    const [bet] = bets;
    const code = BET_CODE[bet.kind];
    if (code === undefined) {
      throw new Error("On chain, use one number, red, black, odd, even, 1-18 or 19-36.");
    }
    const { client, account } = await wallet();
    const receipt = await send(
      client.writeContract({
        account,
        address: ROULETTE,
        abi: rouletteAbi,
        functionName: "spin",
        args: [code, code === 0 ? bet.target[0] : 0, BigInt(bet.amount)],
        gas: 500_000n,
      }),
    );
    const [log] = parseEventLogs({ abi: rouletteAbi, logs: receipt.logs, eventName: "Spun" });
    const number = log.args.result;
    const returned = Math.round(Number(formatUnits(log.args.ticketsWon, 18)));
    const won = returned > 0;
    history.unshift(number);
    return {
      player: await player(account),
      history: [...history],
      result: { number, color: colorOf(number) },
      bets: [{ ...bet, won, winnings: won ? bet.amount * PAYOUTS[bet.kind] : 0 }],
      totalStaked: bet.amount,
      ticketsReturned: returned,
      pointsWon: won ? returned - bet.amount : 0,
    };
  },

  async blackjack(): Promise<BlackjackView> {
    const { account } = await wallet();
    return blackjackView(account);
  },

  async deal(bet: number): Promise<BlackjackView> {
    const { client, account } = await wallet();
    await send(
      client.writeContract({
        account,
        address: BLACKJACK,
        abi: blackjackAbi,
        functionName: "deal",
        args: [BigInt(bet)],
        gas: 900_000n,
      }),
    );
    return blackjackView(account);
  },

  async act(action: Action): Promise<BlackjackView> {
    if (action !== "hit" && action !== "stand") throw new Error("On chain, Blackjack supports Hit and Stand.");
    const { client, account } = await wallet();
    await send(
      client.writeContract({ account, address: BLACKJACK, abi: blackjackAbi, functionName: action, gas: 900_000n }),
    );
    return blackjackView(account);
  },
};
