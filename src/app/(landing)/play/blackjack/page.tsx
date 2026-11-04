import type { Metadata } from "next";
import { BlackjackGame } from "@/components/game/blackjack/BlackjackGame";

export const metadata: Metadata = {
  title: "Blackjack — Morney",
  description: "Classic 6-deck blackjack played with Tickets. Wins earn Prize Points.",
};

export default function BlackjackPage() {
  return <BlackjackGame />;
}
