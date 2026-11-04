import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

import { hexGame } from "@/lib/contracts";

// Opens the next demo day for the player, so the player does not sign a transaction.
// nextDay() is open to anyone, so this relayer key only pays gas. It cannot move any funds.
export async function POST() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) return Response.json({ error: "The relayer is not set up." }, { status: 500 });

  const transport = http(process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz");
  const publicClient = createPublicClient({ chain: monadTestnet, transport });
  const wallet = createWalletClient({ account: privateKeyToAccount(key), chain: monadTestnet, transport });

  const id = (await publicClient.readContract({ ...hexGame, functionName: "currentRoundId" })) as bigint;
  const round = (await publicClient.readContract({ ...hexGame, functionName: "getRound", args: [id] })) as readonly [
    unknown,
    unknown,
    unknown,
    number,
    boolean,
  ];
  if (!round[4]) return Response.json({ ok: true, roundId: id.toString(), note: "Today is still open." });

  try {
    const hash = await wallet.writeContract({ ...hexGame, functionName: "nextDay", gas: 800_000n });
    await publicClient.waitForTransactionReceipt({ hash });
    return Response.json({ ok: true, hash, roundId: (id + 1n).toString() });
  } catch (error) {
    // Another player may have opened the day a moment earlier.
    const message = (error as { shortMessage?: string }).shortMessage ?? "The next day did not open.";
    return Response.json({ error: message }, { status: 409 });
  }
}
