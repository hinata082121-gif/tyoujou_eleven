"use client";

import { UniformScreen } from "../look/UniformScreen";
import { useGameStore } from "@/store/gameStore";
import { useState } from "react";
import { CardScenes, ChoiceScreen, GraduationScene, QueuedScenes } from "../event/EventScene";
import { MonthlyScreen } from "../play/MonthlyScreen";
import { Icon } from "../icons";
import { SideNav } from "../shell/SideNav";
import { TopBar } from "../shell/TopBar";
import dynamic from "next/dynamic";
import { BracketView } from "../play/BracketView";
import { CaptainScreen } from "../play/CaptainScreen";
import { SkillBook } from "../play/SkillBook";
import { FreshmenScreen, GraduationScreen, MatchResultScreen, YearEndScreen, AlumniScreen } from "../play/FlowScreens";
import { HomeView } from "../play/HomeView";
import { BranchScreen, CampResultScreen, CampScreen, FacilitiesScreen, ScoutReplyScreen, ScoutScreen } from "../play/Phase2cScreens";
import { MenuView } from "../play/MenuView";
import { PlayerDetail } from "../play/PlayerDetail";
import { RecordsView } from "../play/RecordsView";
import { SquadView } from "../play/SquadView";
import { NotesScreen } from "../notes/NotesScreen";
import { StaffReviewScreen } from "../staff/StaffView";

/** 試合まわりの画面は、試合のときだけ読み込む（R1。ホームなどの最初の読み込みを軽くする） */
const MatchScreen = dynamic(() => import("../match/MatchScreen").then((m) => m.MatchScreen), { ssr: false, loading: () => <Loading /> });
const PreMatchScreen = dynamic(() => import("../match/PreMatchScreen").then((m) => m.PreMatchScreen), { ssr: false, loading: () => <Loading /> });

function Loading() {
  return <div className="bg-pitch-stripes fixed inset-0" />;
}

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
  const notesOpen = useGameStore((s) => s.notesOpen);
  const skillBookOpen = useGameStore((s) => s.skillBookOpen);
  const teamOpen = useGameStore((s) => s.teamOpen);
  const scoutOpen = useGameStore((s) => s.scoutOpen);
  const facilitiesOpen = useGameStore((s) => s.facilitiesOpen);
  const uniformOpen = useGameStore((s) => s.uniformOpen);
  const lastCamp = useGameStore((s) => s.lastCamp);
  const lastCard = useGameStore((s) => s.lastCard);
  const scenesSeen = useGameStore((s) => s.scenesSeen);
  const eventView = useGameStore((s) => s.settings.eventView);
  const sceneQueue = useGameStore((s) => s.sceneQueue);
  const [gradSeen, setGradSeen] = useState<number | null>(null);

  if (!game) return null;

  // 結果や行事の画面を優先して出す
  if (lastMatch) return <MatchResultScreen />;
  if (lastAlumni) return <AlumniScreen />;
  // 待っている出来事の場面（行事・選択の結果・入学式。R2）
  if (!moving && sceneQueue.length > 0) return <QueuedScenes key={`q${sceneQueue.length}-${sceneQueue[0].kind}-${sceneQueue[0].title}`} />;
  if (lastFreshmen) return <FreshmenScreen />;
  if (lastCamp) return <CampResultScreen />;
  if (game.activeMatch) return <MatchScreen />;
  if (notesOpen) return <NotesScreen />;
  // カードの出来事の場面（移動の演出が終わってから。試合前などの画面より先に見せる）
  if (!moving && lastCard && !scenesSeen && eventView !== "text") return <CardScenes key={`${lastCard.from}-${lastCard.to}`} />;
  if (!moving && game.pending?.type === "staff") return <StaffReviewScreen />;
  if (!moving && game.pending?.type === "captain")
    return (
      <>
        <CaptainScreen />
        {selected && <PlayerDetail />}
      </>
    );
  if (skillBookOpen) return <SkillBook />;
  if (teamOpen)
    return (
      <>
        <CaptainScreen viewOnly />
        {selected && <PlayerDetail />}
      </>
    );
  if (!moving && game.pending?.type === "monthly") return <MonthlyScreen />;
  if (!moving && game.pending?.type === "choice") return <ChoiceScreen key={`${game.calendar.position}-${game.pending.eventId}`} />;
  if (!moving && game.pending?.type === "match") return <PreMatchScreen />;
  if (!moving && game.pending?.type === "camp") return <CampScreen />;
  if (!moving && game.pending?.type === "branch") return <BranchScreen />;
  if (!moving && game.pending?.type === "scoutReply") return <ScoutReplyScreen />;
  if (scoutOpen) return <ScoutScreen />;
  if (facilitiesOpen) return <FacilitiesScreen />;
  if (uniformOpen) return <UniformScreen />;
  if (!moving && game.pending?.type === "graduation") return gradSeen === game.year ? <GraduationScreen /> : <GraduationScene onDone={() => setGradSeen(game.year)} />;
  if (!moving && game.pending?.type === "yearEnd") return <YearEndScreen />;

  return (
    <main className="bg-pitch-stripes fixed inset-0 flex flex-col">
      <TopBar game={game} />
      {saveError && (
        <div className="mx-[max(0.5rem,var(--safe-l))] mt-1 flex items-center gap-2 bg-red px-3 py-1 text-[0.75rem] font-bold text-white">
          <Icon name="warning" size={14} />
          保存に失敗しました：{saveError}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-2 pb-[max(0.5rem,var(--safe-b))] pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] pt-2">
        <SideNav view={view} onChange={setView} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "home" && <HomeView />}
          {view === "squad" && <SquadView />}
          {view === "bracket" && <BracketView />}
          {view === "records" && <RecordsView />}
          {view === "menu" && <MenuView />}
        </div>
      </div>
      {selected && <PlayerDetail />}
    </main>
  );
}
