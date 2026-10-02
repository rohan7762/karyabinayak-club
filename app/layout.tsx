import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "कार्यबिनायक संस्कृति युवा क्लब",
  description: "Karyabinayak Sanskriti Yuba Club · Bhaisepati–25, Lalitpur · Established 2083 BS",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
