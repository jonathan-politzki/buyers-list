import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buyers List Generator",
  description: "Sell-side buyers list generation for mid-market M&A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
