/**
 * Brand font (Bhavya, human design 2026-10-11): Plus Jakarta Sans, a variable font (weights
 * 500-800, Latin subset incl. é/à), bundled locally so builds never need the network.
 * SIL Open Font License 1.1: see ./fonts/PlusJakartaSans-OFL.txt.
 */
import localFont from "next/font/local";

export const brandFont = localFont({
  src: "./fonts/PlusJakartaSans-latin.woff2",
  weight: "500 800",
  display: "swap",
});
