import type { Metadata } from "next";
import { Inter, Inter_Tight, Roboto_Mono } from "next/font/google";
import "./globals.css";

// Monad brand kit: Britti Sans (headlines), Inter (body), Roboto Mono (labels).
// Britti Sans is licensed, so Inter Tight stands in until it's added via next/font/local.
const display = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Morney — More and More Money",
  description:
    "Deposit USDC on Monad, earn daily Tickets, and play for a share of the yield. Your savings never play.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${inter.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
