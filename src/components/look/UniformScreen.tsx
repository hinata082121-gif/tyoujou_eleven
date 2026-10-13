"use client";

import { useState } from "react";
import { generateKits } from "@/engine/look";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { Button, Header } from "../ui";
import { UniformEditor } from "./UniformEditor";

/** メニューの「ユニフォーム」（P4） */
export function UniformScreen() {
  const game = useGameStore((s) => s.game)!;
  const close = useGameStore((s) => s.setUniformOpen);
  const saveKits = useGameStore((s) => s.saveKits);
  const school = playerSchool(game);
  const [kits, setKits] = useState(() => school.kits ?? generateKits(game.seed, school.id));
  return (
    <main className="flex flex-1 flex-col">
      <Header title="ユニフォーム" onBack={() => close(false)} />
      <div className="flex flex-col gap-3 p-4">
        <UniformEditor value={kits} onChange={setKits} seed={game.seed} />
        <Button
          onClick={() => {
            saveKits(kits);
            close(false);
          }}
        >
          このユニフォームにする
        </Button>
      </div>
    </main>
  );
}
