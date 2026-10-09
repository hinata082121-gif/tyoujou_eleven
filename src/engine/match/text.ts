/**
 * 試合イベント → テキスト速報の文。表示はこの文を並べるだけ（結果には影響しない）。
 */
import { TACTICS_LABELS } from "../config/names";
import type { MatchEvent, MatchState } from "./types";

export function playerName(state: MatchState, id: string | undefined): string {
  if (!id) return "";
  for (const t of state.teams) {
    const p = t.players[id];
    if (p) return p.name.split(" ")[0];
  }
  return "";
}

const SHOT_KIND: Record<string, string> = {
  normal: "シュート",
  middle: "ミドルシュート",
  header: "ヘディングシュート",
  rebound: "こぼれ球を押し込みにいく",
  oneOnOne: "GKと1対1からシュート",
  freeKick: "直接FKを狙う",
};

export function describeEvent(state: MatchState, e: MatchEvent): string {
  const team = state.teams[e.side].name;
  const p0 = playerName(state, e.players?.[0]);
  const p1 = playerName(state, e.players?.[1]);
  const score = e.score ? `${e.score[0]}-${e.score[1]}` : "";
  switch (e.type) {
    case "kickoff":
      return "キックオフ！";
    case "halfTime":
      return e.note === "extra" ? `延長前半終了（${score}）` : `前半終了（${score}）`;
    case "secondHalf":
      return "後半開始";
    case "extraTime":
      return "延長戦開始";
    case "extraSecondHalf":
      return "延長後半開始";
    case "fullTime":
      if (e.note === "extra") return `試合終了…${score}の同点で延長戦へ`;
      if (e.note?.startsWith("pk:")) return `PK戦終了（${e.note.slice(3)}）`;
      return `試合終了（${score}）`;
    case "pkShootout":
      return `${score}のまま決着つかず、PK戦へ`;
    case "pass":
      return `${team}：${p0}から${p1}へ鋭いパス`;
    case "passBlocked":
      return `${team}：${p0}のパスは${p1}にカットされた`;
    case "noOption":
      return `${team}：${p0}、出しどころが見つからない`;
    case "dribble":
      return `${team}：${p0}が${p1}をドリブルでかわす！`;
    case "dribbleFail":
      return `${team}：${p0}の突破は${p1}が止めた`;
    case "cross":
      return `${team}：${p0}がクロスを上げる`;
    case "crossCleared":
      return `${p0}がはね返した`;
    case "gkClaim":
      return `${team}：GK${p0}ががっちりキャッチ`;
    case "fumble":
      return `${team}：GK${p0}がボールをこぼした！`;
    case "header":
      return `${team}：${p0}が${p1}との競り合いに勝つ`;
    case "longBall":
      return `${team}：${p0}からロングボール、${p1}が狙う`;
    case "longBallShort":
      return `${team}：${p0}のロングボールは届かない`;
    case "longBallLost":
      return `${team}：${p0}のロングボールは相手ボールに`;
    case "counter":
      return `${team}：${p0}を走らせてカウンター！`;
    case "oneOnOne":
      return `${team}：${p0}が抜け出してGKと1対1！`;
    case "gkRush":
      return `${team}：GK${p0}が飛び出して防いだ！`;
    case "buildUpError":
      return `${team}：${p0}が相手GK${p1}のパスを奪った！ ゴール前でチャンス`;
    case "setPiece":
      return `${team}：${p0}がセットプレーのボールを蹴る`;
    case "corner":
      return `${team}：コーナーキック。キッカーは${p0}`;
    case "freeKick":
      return `${team}：ゴール前でFK。キッカーは${p0}`;
    case "shot":
      return `${team}：${p0}の${SHOT_KIND[e.note ?? "normal"] ?? "シュート"}！`;
    case "block":
      return `${p0}が体を張ってブロック`;
    case "miss":
      return `${p0}のシュートは枠の外`;
    case "save":
      return `GK${p0}がセーブ！`;
    case "catch":
      return `GK${p0}がしっかりキャッチ`;
    case "parry":
      return `GK${p0}がはじいた！ こぼれ球`;
    case "rebound":
      return `${team}：${p0}がこぼれ球に詰める`;
    case "goal":
      return `ゴール！！ ${team} ${p0}（${score}）`;
    case "pkAwarded":
      return `${team}：${p0}が${p1}に倒されてPK獲得！`;
    case "pkGoal":
      return `PK成功！ ${team} ${p0}（${score}）`;
    case "pkMiss":
      return `${team}：${p0}のPKは枠を外れた`;
    case "pkSaved":
      return `GK${p0}がPKを止めた！`;
    case "sub":
      return `${team}：選手交代 ${p1} → ${p0}`;
    case "tactics": {
      const t = state.teams[e.side].tactics;
      return `${team}：戦術を変更（${TACTICS_LABELS.attack[t.attack]}・${TACTICS_LABELS.buildUp[t.buildUp]}）`;
    }
    case "formation":
      return `${team}：フォーメーションを${e.note}に変更`;
    case "position":
      return `${team}：${p0}のポジションを変更`;
    case "foul":
      return `${team}：${p0}が${p1}を倒してファウル`;
    case "yellow":
      return `🟨 ${team}：${p0}にイエローカード`;
    case "secondYellow":
      return `🟥 ${team}：${p0}に2枚目のイエロー、退場！`;
    case "red":
      return `🟥 ${team}：${p0}に一発レッド、退場！`;
    case "injury":
      return `✚ ${team}：${p0}が痛んでピッチの外へ${e.note === "severe" ? "（重傷か）" : ""}`;
    case "shortHanded":
      return `${team}：交代できず、人数が減ったまま戦う`;
    case "note":
      return `${team}：作戦ノート：${e.note}を実行`;
  }
}

/** 速報に出すと冗長なイベント（文は作るが、表示を間引くのに使う） */
export function isMinorEvent(e: MatchEvent): boolean {
  return e.type === "noOption" || e.type === "crossCleared";
}

export function isHighlight(e: MatchEvent): boolean {
  return e.type === "goal" || e.type === "pkGoal" || e.type === "fullTime" || e.type === "halfTime" || e.type === "pkShootout";
}

/** カード・退場・ケガ（スコアボードの近くに目立たせて出す） */
export function isIncident(e: MatchEvent): boolean {
  return e.type === "yellow" || e.type === "secondYellow" || e.type === "red" || e.type === "injury" || e.type === "shortHanded" || e.type === "note";
}
