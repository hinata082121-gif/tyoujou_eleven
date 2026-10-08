import type { Metadata, Viewport } from "next";
import { GAME_SUBTITLE, GAME_TITLE } from "@/engine/config/names";
import "./globals.css";

export const metadata: Metadata = {
  title: GAME_TITLE,
  description: GAME_SUBTITLE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#145a32",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh">
        {/* スマホ縦画面を最優先。PC では中央に縦長で表示する */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white shadow-xl">{children}</div>
      </body>
    </html>
  );
}
