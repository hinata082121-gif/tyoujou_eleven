"use client";

import { useEffect } from "react";
import { NewGameScreen } from "@/components/screens/NewGameScreen";
import { PlayScreen } from "@/components/screens/PlayScreen";
import { SlotsScreen } from "@/components/screens/SlotsScreen";
import { TitleScreen } from "@/components/screens/TitleScreen";
import { useGameStore } from "@/store/gameStore";

export default function Home() {
  const screen = useGameStore((s) => s.screen);
  const init = useGameStore((s) => s.init);
  useEffect(() => init(), [init]);
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
