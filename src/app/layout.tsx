import type { Metadata, Viewport } from "next";
import { Dela_Gothic_One, M_PLUS_1, Oswald } from "next/font/google";
import { GAME_SUBTITLE, GAME_TITLE } from "@/engine/config/names";
import { PortraitNotice } from "@/components/shell/PortraitNotice";
import "./globals.css";

// フォントはビルドのときに取ってきて、自分のサイトから配信する（docs/DESIGN.md）
const dela = Dela_Gothic_One({ weight: "400", subsets: ["latin"], variable: "--font-dela", display: "swap", preload: false });
const mplus = M_PLUS_1({ subsets: ["latin"], variable: "--font-mplus", display: "swap", preload: false });
const oswald = Oswald({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-oswald", display: "swap" });

export const metadata: Metadata = {
  title: GAME_TITLE,
  description: GAME_SUBTITLE,
  appleWebApp: { capable: true, title: GAME_TITLE, statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b120f",
};

// 開発用：?safe=notch でセーフエリアに iPhone の値を入れる（画面の確認用。通常の画面からは見えない）
const SAFE_SCRIPT = `try{if(new URLSearchParams(location.search).get("safe")==="notch")document.documentElement.dataset.safe="notch"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${dela.variable} ${mplus.variable} ${oswald.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SAFE_SCRIPT }} />
      </head>
      <body>
        <div className="app-root">{children}</div>
        <PortraitNotice />
      </body>
    </html>
  );
}
