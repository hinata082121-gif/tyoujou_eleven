import type { FormationId, Position } from "../types";

export type Lane = "L" | "C" | "R";
export type Line = "GK" | "DF" | "MF" | "FW";

export interface Slot {
  pos: Position;
  lane: Lane;
  line: Line;
}

const gk: Slot = { pos: "GK", lane: "C", line: "GK" };

/** フォーメーション（SPEC 10.4）。配列の順がスロット番号 */
export const FORMATIONS: Record<FormationId, Slot[]> = {
  "4-4-2": [
    gk,
    { pos: "SB", lane: "L", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "SB", lane: "R", line: "DF" },
    { pos: "WG", lane: "L", line: "MF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "WG", lane: "R", line: "MF" },
    { pos: "CF", lane: "C", line: "FW" },
    { pos: "CF", lane: "C", line: "FW" },
  ],
  "4-3-3": [
    gk,
    { pos: "SB", lane: "L", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "SB", lane: "R", line: "DF" },
    { pos: "DMF", lane: "C", line: "MF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "WG", lane: "L", line: "FW" },
    { pos: "CF", lane: "C", line: "FW" },
    { pos: "WG", lane: "R", line: "FW" },
  ],
  "4-2-3-1": [
    gk,
    { pos: "SB", lane: "L", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "SB", lane: "R", line: "DF" },
    { pos: "DMF", lane: "C", line: "MF" },
    { pos: "DMF", lane: "C", line: "MF" },
    { pos: "WG", lane: "L", line: "FW" },
    { pos: "OMF", lane: "C", line: "MF" },
    { pos: "WG", lane: "R", line: "FW" },
    { pos: "CF", lane: "C", line: "FW" },
  ],
  "3-5-2": [
    gk,
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "SB", lane: "L", line: "MF" },
    { pos: "DMF", lane: "C", line: "MF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "OMF", lane: "C", line: "MF" },
    { pos: "SB", lane: "R", line: "MF" },
    { pos: "CF", lane: "C", line: "FW" },
    { pos: "CF", lane: "C", line: "FW" },
  ],
  "5-3-2": [
    gk,
    { pos: "SB", lane: "L", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "CB", lane: "C", line: "DF" },
    { pos: "SB", lane: "R", line: "DF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "DMF", lane: "C", line: "MF" },
    { pos: "CMF", lane: "C", line: "MF" },
    { pos: "CF", lane: "C", line: "FW" },
    { pos: "CF", lane: "C", line: "FW" },
  ],
};
