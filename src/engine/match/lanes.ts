/**
 * 動きの範囲（SPEC 7.6、PLAN 3.4）：選手ごとの、左・中央・右のレーンへの関わりやすさ。
 * 試合エンジンの選手選びに使う。P3・P4 の立ち位置の計算でもそのまま使える純粋な関数にする。
 */
import type { Lane, Slot } from "../config/formations";
import { MOVEMENT_AFFINITY, PLAY_STYLE_DEFS } from "../config/playStyle";
import { styleFitsPosition } from "../player/traits";
import type { Foot, LaneAffinity, MovementRange, PlayStyle } from "../types";

const mirror = (a: LaneAffinity): LaneAffinity => ({ L: a.R, C: a.C, R: a.L });

/**
 * 枠のレーン・動きの範囲・利き足から、関わりやすさを出す。
 * - 枠のレーンが L のときは表のまま、R は左右反転
 * - 大外のみ・主に大外の選手が中央の枠に入ったときは、利き足の側を大外として扱う（右足なら右。両利きは左）
 */
export function laneAffinity(slotLane: Lane, movement: MovementRange, foot: Foot | "both" = "R"): LaneAffinity {
  const def = MOVEMENT_AFFINITY[movement];
  if (slotLane === "L") return { ...def.side };
  if (slotLane === "R") return mirror(def.side);
  if (def.centerUsesFoot && foot === "R") return mirror(def.center);
  return { ...def.center };
}

/** 試合で使う動きの範囲。今いる枠のポジションがスタイルの区分に入らなければ「自由」 */
export function effectiveMovement(style: PlayStyle | undefined, slot: Pick<Slot, "pos">): MovementRange {
  if (!style || !styleFitsPosition(style, slot.pos)) return "free";
  return PLAY_STYLE_DEFS[style].movement;
}

export const laneIndex = (lane: Lane): 0 | 1 | 2 => (lane === "L" ? 0 : lane === "C" ? 1 : 2);
