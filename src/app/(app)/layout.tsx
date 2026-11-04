import type { Metadata } from "next";
import { Inter, Inter_Tight, Roboto_Mono } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Same fonts as the landing page.
const display = Inter_Tight({ variable: "--font-display", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Morney — More and More Money",
  description: "Deposit USDC, earn Tickets over time, and play the hex game on Monad Testnet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${inter.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
