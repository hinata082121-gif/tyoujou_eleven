"use client";

import { REPUTATION_NAMES, yearLabel } from "@/engine/config/names";
import { dateLabel } from "@/engine/game";
import { playerSchool } from "@/engine/season";
import { useGameStore, type PlayView } from "@/store/gameStore";
import { MatchScreen } from "../match/MatchScreen";
import { PreMatchScreen } from "../match/PreMatchScreen";
import { BracketView } from "../play/BracketView";
import { FreshmenScreen, GraduationScreen, MatchResultScreen, YearEndScreen, AlumniScreen } from "../play/FlowScreens";
import { HomeView } from "../play/HomeView";
import { MenuView } from "../play/MenuView";
import { PlayerDetail } from "../play/PlayerDetail";
import { RecordsView } from "../play/RecordsView";
import { SquadView } from "../play/SquadView";
import { RankBadge } from "../ui";

const TABS: { view: PlayView; label: string; icon: string }[] = [
  { view: "home", label: "すごろく", icon: "🎲" },
  { view: "squad", label: "部員", icon: "👥" },
  { view: "bracket", label: "大会", icon: "🏆" },
  { view: "records", label: "記録", icon: "📖" },
  { view: "menu", label: "メニュー", icon: "⚙️" },
];

export function PlayScreen() {
  const game = useGameStore((s) => s.game);
  useGameStore((s) => s.rev);
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const selected = useGameStore((s) => s.selectedPlayerId);
  const lastMatch = useGameStore((s) => s.lastMatch);
  const lastAlumni = useGameStore((s) => s.lastAlumni);
  const lastFreshmen = useGameStore((s) => s.lastFreshmen);
  const moving = useGameStore((s) => s.moving);
  const saveError = useGameStore((s) => s.saveError);

  if (!game) return null;

  // 結果や行事の画面を優先して出す
  if (lastMatch) return <MatchResultScreen />;
  if (lastAlumni) return <AlumniScreen />;
  if (lastFreshmen) return <FreshmenScreen />;
  if (game.activeMatch) return <MatchScreen />;
  if (!moving && game.pending?.type === "match") return <PreMatchScreen />;
  if (!moving && game.pending?.type === "graduation") return <GraduationScreen />;
  if (!moving && game.pending?.type === "yearEnd") return <YearEndScreen />;

  const school = playerSchool(game);
  const rep = game.reputation;

  return (
    <main className="flex flex-1 flex-col">
      <div className="sticky top-0 z-20 bg-pitch-dark px-3 pb-2 pt-2 text-white">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 truncate text-base font-black">{school.name}</h1>
          <span className="text-xs text-white/80">ランク</span>
          <RankBadge rank={school.rank} size="sm" />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="font-bold">
            {yearLabel(game.year)} {dateLabel(game)}
          </span>
          <span className="ml-auto">評判「{REPUTATION_NAMES[rep.level]}」</span>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/25">
            <div className="h-full bg-amber-300" style={{ width: `${rep.gauge}%` }} />
          </div>
        </div>
      </div>
      {saveError && <div className="bg-red-100 px-3 py-1 text-xs text-red-800">保存に失敗しました：{saveError}</div>}

      <div className="flex-1 pb-20">
        {view === "home" && <HomeView />}
        {view === "squad" && <SquadView />}
        {view === "bracket" && <BracketView />}
        {view === "records" && <RecordsView />}
        {view === "menu" && <MenuView />}
      </div>

      {selected && <PlayerDetail />}

      <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[430px] -translate-x-1/2 grid-cols-5 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            onClick={() => setView(t.view)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${view === t.view ? "text-pitch" : "text-gray-400"}`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
