"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import { NewGameScreen } from "@/components/screens/NewGameScreen";
import { PlayScreen } from "@/components/screens/PlayScreen";
import { SlotsScreen } from "@/components/screens/SlotsScreen";
import { TitleScreen } from "@/components/screens/TitleScreen";
import { useGameStore } from "@/store/gameStore";

/** 開発用：?demo3d=1 で 3D 観戦のデモ（R1）、?demo2d=1 で同じ試合を 2D で（R3）。通常の画面のバンドルに入れないよう、動的に読み込む */
const Demo3DScreen = dynamic(() => import("@/components/demo/Demo3DScreen").then((m) => m.Demo3DScreen), { ssr: false });
const noSubscribe = () => () => {};
const isDemo3d = () => {
  const q = new URLSearchParams(window.location.search);
  return q.get("demo3d") === "1" || q.get("demo2d") === "1";
};

export default function Home() {
  const screen = useGameStore((s) => s.screen);
  const init = useGameStore((s) => s.init);
  const demo3d = useSyncExternalStore(noSubscribe, isDemo3d, () => false);
  useEffect(() => init(), [init]);
  if (demo3d) return <Demo3DScreen />;
  switch (screen) {
    case "title":
      return <TitleScreen />;
    case "slots":
      return <SlotsScreen />;
    case "new":
      return <NewGameScreen />;
    case "play":
      return <PlayScreen />;
  }
}
