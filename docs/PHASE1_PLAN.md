# Phase 1 実装計画（承認待ち）

> `docs/prompts/phase1.md` の「0. 最初にやること」に従い、実装前の計画をまとめたもの。
> 承認後に実装を始める。末尾の「確認したいこと」への回答で、必要に応じて `docs/SPEC.md` を更新する。

---

## 1. ディレクトリ構成

```
.
├─ CLAUDE.md
├─ docs/
│  ├─ SPEC.md                 仕様の正本
│  ├─ PHASE1_PLAN.md          この計画
│  └─ prompts/phase1.md       Phase 1 の依頼文
├─ next.config.ts             output: 'export'
├─ vitest.config.ts
├─ scripts/
│  └─ balance.ts              npm run balance（tsx で実行）
└─ src/
   ├─ app/                    Next.js App Router（すべて 'use client' の画面。SSR/API なし）
   │  ├─ layout.tsx           スマホ縦の中央カラム（max-w 430px）
   │  ├─ page.tsx             タイトル
   │  ├─ slots/page.tsx       セーブ枠 3 つ
   │  ├─ new/page.tsx         学校作成
   │  └─ play/page.tsx        ゲーム本体（中の画面切り替えは store の screen で行う）
   ├─ components/             画面・部品（Board, Hand, SquadList, PlayerDetail, PreMatch,
   │                          MatchView, HalfTime, PkShootout, Bracket, YearEnd, SaveMenu …）
   ├─ store/                  Zustand（gameStore, matchStore, uiStore）
   ├─ lib/save/               localStorage 3 枠、schemaVersion、migrations、JSON 書き出し/読み込み
   └─ engine/                 純粋な TypeScript（React/DOM/ブラウザ API を import しない）
      ├─ rng/                 シード付き PRNG（sfc32）。状態は number[4] でセーブ可能
      ├─ config/              バランス数値と表示名
      │  ├─ names.ts          ゲーム名・県名・大会名・学校名パーツ・選手名パーツ
      │  ├─ reputation.ts     評判ごとの手札枚数・1学年人数・ゲージ増減
      │  ├─ player.ts         ランク境界・生成分布・身長
      │  ├─ growth.ts         必要経験点カーブ・伸びしろ
      │  ├─ practice.ts       練習カード（対象・伸びる能力・1日あたり経験点・体力消費）
      │  ├─ calendar.ts       マスの出現比率・固定日程・カードの出やすさ
      │  ├─ events.ts         イベント定義（10〜15 種）
      │  ├─ match.ts          試合エンジン係数
      │  ├─ formations.ts     5 フォーメーション
      │  └─ competitions.ts   大会ごとの試合ルール・日程
      ├─ types/               型定義
      ├─ player/              生成・ランク変換・成長・コンディション
      ├─ school/              学校・県・全国の生成、CPU 校の年次更新、チーム力→ランク
      ├─ calendar/            1 年分のマス生成、カード補充、進行（必ず止まるマス）
      ├─ practice/            経験点計算と配分
      ├─ events/              イベント抽選と適用
      ├─ match/               試合エンジン（区間計算・判定・疲労・PK・CPU 采配）
      ├─ competition/         トーナメント表の生成と進行
      ├─ reputation/          評判ゲージ
      ├─ season/              入学・引退・卒業・年度替わり
      └─ game/                GameState と「操作 → 新しい状態」の関数群（UI はこれだけ呼ぶ）
```

- `engine/**` のテストは同じ場所に `*.test.ts` で置く。
- ESLint で `src/engine/**` からの `react` / `next` / `window` / `document` / `localStorage` / `Math.random` の使用を禁止するルールを入れる（原則を機械的に守る）。

## 2. 主要な型（概略）

```ts
// ---- 乱数 ----
type RngState = [number, number, number, number];           // sfc32 の内部状態
interface Rng { next(): number; int(a: number, b: number): number; pick<T>(xs: T[]): T; state(): RngState }

// ---- 選手 ----
type Rank = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
type Position = 'GK' | 'CB' | 'SB' | 'DMF' | 'CMF' | 'OMF' | 'WG' | 'CF';
type Aptitude = 3 | 2 | 1;                                    // ◎ / ○ / △
type Foot = 'R' | 'L' | 'B';
type CommonStat = 'vision' | 'kickPower' | 'speed' | 'stamina' | 'pass' | 'technique' | 'physical' | 'pkSkill';
type FieldStat  = 'shooting' | 'dribble' | 'defense' | 'aerial' | 'decision';
type GkStat     = 'saving' | 'highBall' | 'positioning' | 'catching';
type StatKey = CommonStat | FieldStat | GkStat;

interface Player {
  id: string; name: string;
  grade: 1 | 2 | 3; enrolledYear: number;
  status: 'active' | 'retired';                 // retired = 引退済み 3 年生（卒業まで名簿に残る）
  heightCm: number; heightGrowthLeft: number;   // 在学中に少し伸びる
  foot: Foot;
  aptitude: Record<Position, Aptitude>;
  stats: Record<StatKey, number>;               // 1〜100。全員が全項目を持ち、表示は役割で切り替え
  exp: Partial<Record<StatKey, number>>;        // 端数の経験点
  potential: number;                            // 隠し「伸びしろ」 0.7〜1.4
  fitness: number;                              // 体力 0〜100
  condition: -2 | -1 | 0 | 1 | 2;               // 調子（絶不調〜絶好調）
  injuryDays: number;                           // 0 なら健康
  admission: 'general';                         // P2 で 'scholarship' を追加
}

// ---- 学校 ----
type SchoolRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
type ReputationLevel = 0 | 1 | 2 | 3 | 4;       // 弱小〜名門
interface School {
  id: string; name: string; prefectureId: string; isPlayer: boolean;
  players: Player[];                            // CPU 校も部員を持つ（保存は圧縮形式）
  rank: SchoolRank;                             // チーム力から算出（自校も表示用に算出）
  defaultSetup: TeamSetup;                      // CPU の基本采配
}
interface Prefecture { id: string; name: string; schoolIds: string[]; isPlayerPref: boolean }
interface Reputation { level: ReputationLevel; gauge: number }   // gauge 0〜100

// ---- カレンダー ----
type SquareType = 'blue' | 'red' | 'white' | 'green' | 'yellow' | 'major';
type MajorKind = 'entrance' | 'practiceMatch' | 'prefQualifier' | 'national' | 'graduation';
interface Square { dayIndex: number; date: string; type: SquareType; major?: { kind: MajorKind; ref?: string } }
type PracticeKind = 'shoot' | 'pass' | 'dribble' | 'defense' | 'physical' | 'run'
                  | 'tactics' | 'gk' | 'setPiece' | 'rest';      // PK 練習は P2
interface MoveCard { id: string; value: 1 | 2 | 3 | 4 | 5; practice: PracticeKind }
interface Calendar { year: number; squares: Square[]; position: number; hand: MoveCard[]; lastPractice?: PracticeKind }

// ---- 試合 ----
type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2';
interface Tactics { attack: 'attacking' | 'balanced' | 'defensive'; buildUp: 'buildUp' | 'long';
                    press: 'high' | 'mid' | 'low'; line: 'high' | 'low' }
interface TeamSetup { formation: FormationId; tactics: Tactics; lineup: string[11]; bench: string[] /* ≤9 */ }
interface MatchRules { halfMinutes: number; extraTime: null | { halfMinutes: number };
                       pkOnDraw: boolean; maxSubs: number; maxSubWindows: number | null; benchSize: number }
interface MatchEvent { minute: number; side: 0 | 1; type: 'kickoff' | 'chance' | 'shot' | 'save' | 'parry'
                       | 'goal' | 'miss' | 'block' | 'cross' | 'turnover' | 'corner' | 'freeKick' | 'pk' | 'sub'
                       | 'tactics' | 'halfTime' | 'fullTime' | …; playerIds: string[]; text?: string }
interface MatchState {                         // 純粋データ。区間の途中でもセーブ可能
  rules: MatchRules; seed: RngState; segment: number; phase: 'first' | 'second' | 'et1' | 'et2' | 'pk' | 'done';
  teams: [MatchTeam, MatchTeam];               // 出場選手・体力・交代数・保留中の采配
  score: [number, number]; momentum: number;   // -100〜100
  events: MatchEvent[]; pk?: PkState;
}

// ---- 大会 ----
interface Bracket { id: string; rounds: BracketMatch[][]; rulesByRound: MatchRules[]; dates: string[] }

// ---- ゲーム全体・セーブ ----
interface GameState {
  year: number; rng: RngState; playerSchoolId: string;
  schools: Record<string, School>; prefectures: Prefecture[];
  reputation: Reputation; calendar: Calendar;
  competitions: { winterPref?: Bracket; winterNational?: Bracket };
  pendingMatch?: MatchState;                   // 試合中に閉じても区間単位で再開できる
  alumni: Alumni[];                            // OB（進路付き。P2 のスタッフ制度で使う）
  history: SeasonRecord[]; log: string[];
}
interface SaveData { schemaVersion: number; slot: 0 | 1 | 2; savedAt: string; summary: SlotSummary; game: GameState }
```

## 3. 試合エンジンの判定式（初期案。係数は `config/match.ts`、数値は balance で調整）

**選手の実効値**：`eff(stat) = stat × 適性係数(◎1.00/○0.90/△0.75) × 疲労係数 × 調子係数(0.94〜1.06)`
疲労係数 = `0.75 + 0.25 × (体力/100)`。

**ゾーン評価**：フォーメーションの各スロットにポジションとゾーン重みを持たせ、攻撃 L/C/R・中盤・守備 L/C/R・GK を計算。
中盤 = パス・テクニック・視野・判断・フィジカル・スタミナの重み付き和。

**区間（5 分）ごと**
1. 支配率 `p = mid_A^k / (mid_A^k + mid_B^k)` に戦術補正（攻撃的 +、プレス高 +、モメンタム ±）。
2. その区間の攻撃回数を両チーム合計の期待値（≈2.4）からポアソンで抽選し、支配率で配分。
3. プレス強度とスタミナで体力を減らす（`減少 = base × プレス係数 × (1.3 − スタミナ/100 × 0.6)`）。
4. 采配の変更（交代・戦術・フォーメーション）は区間の頭でまとめて反映。

**攻撃 1 回**
1. ルート選択：中央／サイド（攻撃 L or R）／カウンター（相手のライン高で増）／ロングボール（組み立て=ロングで増）／セットプレー。
   - ビルドアップ重視なら、相手プレスの強さに対して自 GK の「パス＋テクニック」で判定。失敗で**自陣ゴール前でボールを奪われる**（相手に質の高い決定機）。
   - ロングボールの起点が GK なら GK のキック力が効く。
2. **視野×判断（チャンス化）**
   - 候補数 `n = 1 + floor(視野 / 25)`（1〜5）。候補ごとに「難しさ」を乱数で持つ。
   - 余裕時間 `T = T0 − a × 相手守備の質(守備・判断の平均 + プレス補正)`
   - 必要時間 `t_i = t0 − b × 判断 + 難しさ_i`
   - `t_i ≤ T` の候補だけが出せる → 弱い相手には出せるパスが強い相手には出せない。0 本なら攻撃失敗（奪われる）。
   - 出せた候補のうち最良のものの質＋受け手の判断（動き出し）でチャンスの質 `Q` を決める。ドリブル突破（ドリブル×スピード vs 守備×スピード）も選択肢。
   - ロングパスは `精度=パス` × `届くか=キック力 vs 必要距離`。届かなければ奪われる。
3. **シュート**：`シュート質 = シュート精度 × w1 + キック力 × w2`（ミドルは w2 を大きく）− 相手のブロック。枠内率は精度、強さはキック力。
4. **GK の流れ**
   - ポジショニングで「届く範囲」→ コースが範囲外なら失点。
   - 範囲内ならセービング vs シュートの強さで止めるか。
   - 止めたらキャッチング判定。失敗はこぼれ球 → 攻撃側が先に触れば 2 本目のシュート（質は下げる）。
   - クロス：ハイボール＋身長で届くか → キャッチング（低いとファンブル）→ 届かなければヘディングの競り合い（空中戦＋身長）。
5. **得点の分布**：決定率はシグモイドで 0.03〜0.6 程度に収め、極端なスコアを抑える。
6. 試合中の PK（ボックス内のファウル、低確率）は PK 戦と同じ判定。

**PK（10.6）**
`読み勝ち確率 = σ((キッカーのPK駆け引き − GKのPK駆け引き)/s + c)`（スカウティング項は 0）。
読み勝ち → ほぼ得点（キック精度が低いと枠外）。読まれた → `シュート+キック力` vs `セービング+ポジショニング` を σ で比較。
5 本ずつ → サドンデス。キッカーは試合終了時にピッチにいた選手のみ。

**モメンタム**：チャンス・シュート・得点で加算、毎区間減衰。支配率に小さく効く。

**CPU 采配**：ベスト 11 を適性込みの評価値で選び、基本フォーメーションで出す。60 分以降に体力の低い選手から交代、負けていれば攻撃的に。自校と同じエンジンで計算（表示はしない）。

## 4. 作業の順番

1. 足場：Next.js + TS strict + Tailwind + Zustand + Vitest + ESLint、`output: 'export'`、スクリプト整備。CLAUDE.md・SPEC.md をリポジトリに配置（済）。
2. エンジン基礎：rng、config、型、ランク変換、選手生成、学校・県・全国の生成（テスト）。
3. 成長・練習・カレンダー・イベント・体力/調子/ケガ（テスト）。
4. 試合エンジン・PK・CPU 采配（テスト）→ `npm run balance` を作り、SPEC 14 章の目標に合わせて調整。
5. 大会（県予選・全国 32 校）、評判ゲージ、入学・引退・卒業・年度替わり、CPU 校の年次更新（テスト）。
6. セーブ（3 枠・schemaVersion・migrations・JSON 書き出し/読み込み、テスト）。
7. UI：タイトル → 枠選択 → 学校作成 → すごろく画面 → 部員一覧/詳細 → 試合前 → 観戦（等速/2倍/4倍・一時停止） → ハーフタイム → PK 戦 → トーナメント表 → 年度末。
8. 通し確認：エンジンだけで「2 年以上を自動で進める」テストを書き、さらに Playwright（375px）で画面を一周。
9. lint / test / build を通し、CLAUDE.md のコマンド欄を更新、報告。

機能単位でこまめにコミットし、このブランチに push する。

---

## 5. 確認したいこと（推奨案つき）

1. **他県の学校の持ち方（セーブ容量）**
   全国 32 校 = 自県代表 + 他県 31 の代表。全県に 16〜32 校×30 人超を持たせると localStorage（約 5MB を 3 枠で共有）に入らない。
   - **推奨 A**：自県（16〜32 校）は全校が部員付き。他県は各 3 校だけ部員付きで持ち、毎年その 3 校の中から代表を同じエンジンで決める（表示なし）。部員は数値配列で圧縮保存（1 枠 0.5MB 程度の見込み）。
   - B：他県校は名前とランクだけ持ち、全国大会のたびにシードから部員を決定的に生成する（容量は最小だが毎年の成長がない）。
2. **すごろくのマスの単位**：仕様どおり 1 マス = 1 日（1 年 365 マス）で作ると、カードを使う回数は 1 年で約 100〜120 回になる。このままでよいか。（推奨：仕様どおり 1 日。テンポは手札 UI を軽くして対応）
3. **県予選の試合ルール**：SPEC 10.2 の表は全国大会向けと読める。県予選は「準々決勝まで 80 分・同点ですぐ PK、準決勝 90 分・すぐ PK、決勝 90 分＋延長 20 分＋PK」と同じ扱いでよいか。（推奨：同じ扱い。`competitions.ts` で個別に変更可能にする）
4. **進行カードの「種類」**：カードの種類 = 練習の種類（10 種、休養を含む）と解釈し、カードを使うとその練習を進んだ日数だけ行う形にしてよいか。止まったマスのイベントだけが発生する（通過したマスは発生しない）。
5. **自校のランク表示と「評判が 2 段階上」**：評判（5 段階）とランク（E〜S の 6 段階）は別物とし、ランクはチーム力から計算する。バランスの「評判が 2 段階上の相手」は「ランクが 2 段階上（例：E 対 C）」で測る。対応の目安は 弱小≈E、そこそこ≈D、中堅≈C、強豪≈B、名門≈A、S は名門の中でも特に強い年。これでよいか。
6. **試合中のカード・ケガ**：P1 ではイエロー/レッドカードと試合中のケガは入れず、疲労のみとする（作戦ノートで使う P2 以降に追加）。よいか。
7. **試合中のリロード**：試合の途中でも区間（5 分）ごとに状態をセーブし、リロードしたらその区間から再開する（やり直しで結果を変えられないよう、乱数状態も保存）。よいか。
8. **練習試合のマス**：月に 1〜2 回程度、自県の学校（自校のランク ±1）とランダムに組む。試合時間 70 分、同点で終了、交代 5 人。よいか。
9. **表示名（仮）**：ゲーム名・県名・大会名・学校名は架空の仮名で `names.ts` に置く（例：大会名「冬の選手権」、県名は実在しない造語）。希望の名前があれば教えてほしい。
10. **GK とフィールドの能力**：内部では全選手が全項目を持ち（役割外の項目は低め、練習でも伸びにくい）、画面では役割に合う項目だけを表示する。緊急で GK 以外が GK をしても破綻しないようにするため。よいか。
