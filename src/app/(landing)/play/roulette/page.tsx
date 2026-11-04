import type { Metadata } from "next";
import { RouletteGame } from "@/components/game/roulette/RouletteGame";

export const metadata: Metadata = {
  title: "Roulette — Morney",
  description: "European single-zero roulette played with Tickets. Wins earn Prize Points.",
};

export default function RoulettePage() {
  return <RouletteGame />;
}
