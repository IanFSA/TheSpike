import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Spike",
  description: "A private silent cue board for Ian and Spike."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
