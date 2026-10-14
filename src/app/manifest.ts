import type { MetadataRoute } from "next";
import { GAME_SUBTITLE, GAME_TITLE } from "@/engine/config/names";

// ホーム画面に追加したときは横向き・全画面で開く（SPEC 2章。iPhone の Safari は向きの設定を無視する）
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: GAME_TITLE,
    short_name: GAME_TITLE,
    description: GAME_SUBTITLE,
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b120f",
    theme_color: "#0b120f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
