"use client";

import { useState } from "react";
import { generateKits } from "@/engine/look";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { Button, Screen } from "../ui";
import { UniformEditor } from "./UniformEditor";

/** メニューの「ユニフォーム」（P4）：左に前後の全身の絵、右に柄と色。決定は題名の帯の右 */
export function UniformScreen() {
  const game = useGameStore((s) => s.game)!;
  const close = useGameStore((s) => s.setUniformOpen);
  const saveKits = useGameStore((s) => s.saveKits);
  const school = playerSchool(game);
  const [kits, setKits] = useState(() => school.kits ?? generateKits(game.seed, school.id));
  return (
    <Screen
      title="ユニフォーム"
      sub={school.name}
      onBack={() => close(false)}
      right={
        <Button
          icon="check"
          cut
          onClick={() => {
            saveKits(kits);
            close(false);
          }}
        >
          このユニフォームにする
        </Button>
      }
    >
      <UniformEditor value={kits} onChange={setKits} seed={game.seed} />
    </Screen>
  );
}
