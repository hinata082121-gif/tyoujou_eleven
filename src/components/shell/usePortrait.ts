"use client";

import { useEffect, useState } from "react";

/** 縦に持っているか（縦持ちの画面が出ている間、試合の時計などを止めるのに使う） */
export function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return portrait;
}
