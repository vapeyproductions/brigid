// app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Fonts
import { Nunito, Geist_Mono } from "next/font/google";

// Brand icon
import { CloverIcon } from "@/components/CloverIcon"; // use "../components/CloverIcon" if not using "@/"

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"], // regular, semibold, bold
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brigid",
  description: "Accessible Maternal Care",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Nunito globally; Geist Mono available via CSS var / font-mono */}
      <body className={`${nunito.className} ${geistMono.variable} antialiased`}>
        <header className="border-b bg-white">
          <div className="mx-auto max-w-5xl p-4 flex items-center justify-between">
            {/* Brand logo: wordmark + clover (brand palette) */}
            <Link href="/" className="flex items-center gap-2 group" aria-label="Go to homepage">
              <h1 className="text-xl font-semibold text-brand-800 flex items-center gap-2">
                Brigid
                <CloverIcon className="h-5 w-5 text-brand-600 transition-transform group-hover:rotate-6" />
              </h1>
            </Link>

            <nav className="text-sm space-x-4">
              <Link href="/login" className="text-brand-800 hover:text-brand-900">
                Log in
              </Link>
              <Link href="/signup" className="text-brand-800 hover:text-brand-900">
                Sign up
              </Link>
              <Link href="/dashboard" className="text-brand-800 hover:text-brand-900">
                Dashboard
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl p-4">{children}</main>

        <footer className="mx-auto max-w-5xl p-4 text-xs text-gray-600">
          Not a medical device. Educational use only. If you are concerned, contact your clinician or go to L&amp;D.
        </footer>
      </body>
    </html>
  );
}
