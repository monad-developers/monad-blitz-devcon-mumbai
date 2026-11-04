import { redirect } from "next/navigation";

// The Ticket Booster games (Roulette and Blackjack) live on the /play screens.
export default function CasinoPage() {
  redirect("/play");
}
