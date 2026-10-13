/**
 * イベントが起きたピッチの辺り（P3。簡易2D・3D の演出用。試合の計算には使わない）。
 * イベントの側（side）のチームから見た位置：ownBox = 自陣ゴール前、own = 自陣、mid = 中盤、opp = 敵陣、box = 敵陣ゴール前
 */
import type { MatchEventType, Zone } from "./types";

export const EVENT_ZONES: Partial<Record<MatchEventType, Zone>> = {
  pass: "mid",
  passBlocked: "mid",
  noOption: "mid",
  switchPlay: "mid",
  longBallShort: "mid",
  longBallLost: "opp",
  counter: "own",
  throughBall: "opp",
  dribble: "opp",
  dribbleFail: "opp",
  cross: "opp",
  longBall: "opp",
  freeKick: "opp",
  setPiece: "opp",
  longThrow: "opp",
  buildUpError: "opp",
  foul: "own",
  corner: "box",
  crossCleared: "box",
  header: "box",
  rebound: "box",
  oneOnOne: "box",
  pkAwarded: "box",
  pkGoal: "box",
  pkMiss: "box",
  shot: "box",
  miss: "box",
  goal: "box",
  gkClaim: "ownBox",
  fumble: "ownBox",
  gkRush: "ownBox",
  block: "ownBox",
  save: "ownBox",
  catch: "ownBox",
  parry: "ownBox",
  pkSaved: "ownBox",
};
