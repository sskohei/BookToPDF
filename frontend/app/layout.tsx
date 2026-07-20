import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const mPlusRounded = M_PLUS_Rounded_1c({
  variable: "--font-m-plus-rounded",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  // M PLUS Rounded 1c has no separate "japanese" subset in next/font's Google
  // Fonts metadata — its Japanese glyphs ship as part of the default charset,
  // split into hundreds of unicode-range files. Preloading all of them would
  // be wasteful, so let the browser fetch only the ranges actually rendered.
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "BookToPDF",
  description: "本のページ写真を見開き/単ページに自動分割してPDFにまとめるアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${mPlusRounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
