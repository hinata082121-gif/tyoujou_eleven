"use client";

/**
 * 画面の状態とゲームの状態（Zustand）。
 * ゲームの計算はすべて src/engine を呼ぶ。エンジンは GameState を直接書き換えるので、
 * 書き換えたら rev を進めて画面を更新し、オートセーブする。
 */
import { create } from "zustand";
import {
  confirmGraduation,
  confirmYearEnd,
  finishPlayerMatch,
  newGame,
  playCard,
  startPlayerMatch,
  type CardResult,
  type MatchSummary,
} from "@/engine/game";
import type { Alumnus, GameState, Player, TeamSetup } from "@/engine/types";
import { SaveManager, type SlotSummary } from "@/lib/save";

export type Screen = "title" | "slots" | "new" | "play";
export type PlayView = "home" | "squad" | "bracket" | "records" | "menu";

const LAST_SLOT_KEY = "tyoujou-eleven:lastSlot";
const SETTINGS_KEY = "tyoujou-eleven:settings";

export interface Settings {
  /** すごろくの移動演出をスキップ */
  skipMove: boolean;
  /** 観戦の速さ（等速 = 試合時間 15 分が現実の 1 分） */
  matchSpeed: 1 | 2 | 4;
}

const defaultSettings: Settings = { skipMove: false, matchSpeed: 1 };

function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

let manager: SaveManager | null = null;
export function saveManager(): SaveManager {
  if (!manager) manager = new SaveManager();
  return manager;
}

/** 保存は順番に行う（書き込みが重ならないように） */
let saveChain: Promise<unknown> = Promise.resolve();

interface GameStore {
  screen: Screen;
  slot: number | null;
  game: GameState | null;
  rev: number;
  view: PlayView;
  selectedPlayerId: string | null;
  lastCard: CardResult | null;
  lastMatch: MatchSummary | null;
  lastAlumni: Alumnus[] | null;
  lastFreshmen: Player[] | null;
  settings: Settings;
  saveError: string | null;
  /** すごろくの移動演出中（演出が終わるまで次の画面に進まない） */
  moving: boolean;
  setMoving(v: boolean): void;

  init(): void;
  goto(screen: Screen): void;
  setView(view: PlayView): void;
  selectPlayer(id: string | null): void;
  updateSettings(patch: Partial<Settings>): void;

  loadSlot(slot: number): Promise<void>;
  createGame(slot: number, schoolName: string, prefectureId: string): Promise<void>;
  /** エンジンで書き換えた後に呼ぶ：画面更新とオートセーブ */
  touch(save?: boolean): void;
  save(): Promise<void>;

  playCard(cardId: string): CardResult | null;
  clearLastCard(): void;
  /** mode = "auto"（結果のみ）は練習試合だけ。すぐに結果画面へ進む */
  startMatch(setup: TeamSetup, mode?: "watch" | "auto"): void;
  finishMatch(): void;
  clearLastMatch(): void;
  graduate(): void;
  clearAlumni(): void;
  newYear(): void;
  clearFreshmen(): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: "title",
  slot: null,
  game: null,
  rev: 0,
  view: "home",
  selectedPlayerId: null,
  lastCard: null,
  lastMatch: null,
  lastAlumni: null,
  lastFreshmen: null,
  settings: defaultSettings,
  saveError: null,
  moving: false,
  setMoving(v) {
    set({ moving: v });
  },

  init() {
    set({ settings: readSettings() });
  },
  goto(screen) {
    set({ screen });
  },
  setView(view) {
    set({ view, selectedPlayerId: null });
  },
  selectPlayer(id) {
    set({ selectedPlayerId: id });
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // 設定が保存できなくてもゲームは続けられる
    }
    set({ settings });
  },

  async loadSlot(slot) {
    const game = await saveManager().load(slot);
    if (!game) throw new Error("セーブデータがありません");
    try {
      window.localStorage.setItem(LAST_SLOT_KEY, String(slot));
    } catch {
      // 無視
    }
    set({ game, slot, screen: "play", view: "home", rev: get().rev + 1, lastCard: null, lastMatch: null, lastAlumni: null, lastFreshmen: null });
  },

  async createGame(slot, schoolName, prefectureId) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    const seed = `${Date.now().toString(36)}-${buf[0].toString(36)}${buf[1].toString(36)}`;
    const game = newGame(seed, schoolName, prefectureId);
    set({ game, slot, screen: "play", view: "home", rev: get().rev + 1, lastCard: null, lastMatch: null, lastAlumni: null, lastFreshmen: null });
    try {
      window.localStorage.setItem(LAST_SLOT_KEY, String(slot));
    } catch {
      // 無視
    }
    await get().save();
  },

  touch(save = true) {
    set({ rev: get().rev + 1 });
    if (save) void get().save();
  },

  async save() {
    const { game, slot } = get();
    if (!game || slot === null) return;
    saveChain = saveChain
      .then(() => saveManager().save(slot, game))
      .then(() => set({ saveError: null }))
      .catch((e: unknown) => set({ saveError: e instanceof Error ? e.message : String(e) }));
    await saveChain;
  },

  playCard(cardId) {
    const game = get().game;
    if (!game) return null;
    const r = playCard(game, cardId);
    if (r) {
      set({ lastCard: r, moving: !get().settings.skipMove && r.days > 0 });
      get().touch();
    }
    return r;
  },
  clearLastCard() {
    set({ lastCard: null });
  },

  startMatch(setup, mode = "watch") {
    const game = get().game;
    if (!game) return;
    startPlayerMatch(game, setup, mode);
    if (mode === "auto" && game.activeMatch) {
      get().finishMatch();
      return;
    }
    get().touch();
  },
  finishMatch() {
    const game = get().game;
    if (!game) return;
    const summary = finishPlayerMatch(game);
    set({ lastMatch: summary });
    get().touch();
  },
  clearLastMatch() {
    set({ lastMatch: null });
  },
  graduate() {
    const game = get().game;
    if (!game) return;
    set({ lastAlumni: confirmGraduation(game) });
    get().touch();
  },
  clearAlumni() {
    set({ lastAlumni: null });
  },
  newYear() {
    const game = get().game;
    if (!game) return;
    set({ lastFreshmen: confirmYearEnd(game) });
    get().touch();
  },
  clearFreshmen() {
    set({ lastFreshmen: null });
  },
}));

export function lastSlot(): number | null {
  try {
    const v = window.localStorage.getItem(LAST_SLOT_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export async function loadSummaries(): Promise<(SlotSummary | null)[]> {
  const m = saveManager();
  return Promise.all([0, 1, 2].map((i) => m.summary(i).catch(() => null)));
}
