import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b bg-white">
         <div className="mx-auto max-w-5xl p-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Brigid</h1>
          <nav className="text-sm space-x-4">
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
            <Link href="/dashboard">Dashboard</Link>
          </nav>
        </div>
      </header>

  <main className="mx-auto max-w-5xl p-4">
    {children}
  </main>

  <footer className="mx-auto max-w-5xl p-4 text-xs text-gray-600">
    Not a medical device. Educational use only. If you are concerned,
    contact your clinician or go to L&amp;D.
  </footer>
</body>

    </html>
  );
}
