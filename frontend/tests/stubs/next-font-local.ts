/** Test stand-in for next/font/local, which only works inside the Next.js compiler. */
export default function localFont() {
  return { className: "", style: { fontFamily: "sans-serif" } };
}
