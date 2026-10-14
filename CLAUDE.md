# CLAUDE.md

## プロジェクト概要

高校サッカー部の監督として学校を育てるブラウザゲーム（仮題）。
すごろく式のカレンダーで練習やイベントを進め、3年で部員が入れ替わる中、全国の頂点を目指す。

## 必ず守ること

- **仕様の正本は `docs/SPEC.md`**。作業の前に必ず読むこと。
  - 仕様と矛盾する実装や、仕様にない重要な判断が必要になったときは、実装せずにユーザーに確認する。合意したら `docs/SPEC.md` を更新する。
- **現在のフェーズを守る**。そのフェーズの範囲外の機能は作らない。拡張しやすい作りにとどめる。
- **知財ルール（SPEC.md 3章）を厳守する**。「パワプロ」「栄冠ナイン」の名称と、それらに固有の用語、実在の学校・選手・大会の名称や商標は、コード・UI・コメントのどこにも使わない。

## 現在のフェーズ

- **Phase R2**（SPEC.md 13章・18章を参照）：ゲームの流れの作り直し。すごろくの公開範囲を 10 日先までにし、大会の日程はすごろく上で隠す。毎月 1 日の個別の育成指示、学校行事（入学式・体育祭・テスト・文化祭・修学旅行・卒業式）と学力、選択肢のあるイベントと信頼度、イベントの場面の見せ方の決まり、イベントの文章を話し言葉に。**今は計画の段階**：計画は `docs/PHASE_R2_PLAN.md`（試作の画面は `docs/phaseR2/proto/`）。**ユーザーが計画を承認するまで実装しない**。R3（試合の見せ方の作り直し）・Phase 4b（3D の動きと演出の仕上げ。R3 の後）・Phase 5 の内容は作らない
- Phase R1 は実装済み（報告は `docs/PHASE_R1_REPORT.md`。デザインは `docs/DESIGN.md` の B：スポーツ中継風）
- Phase 4a は実装済み（報告は `docs/PHASE4A_REPORT.md`）

## アーキテクチャの原則

- Next.js（App Router）＋TypeScript（strictモード）。`output: 'export'` による静的書き出しのみで動かす。API Routes・SSR・Server Actionsは使わない。
- `src/engine/` はUIから独立した純粋なTypeScriptにする。React・DOM・ブラウザAPIをimportしない。
- 乱数は必ず `src/engine/rng` のシード付き疑似乱数を使う。`Math.random()` は使わない。
- バランス調整用の数値は `src/engine/config/` に集約する。マジックナンバーを散らばらせない。
- 表示名（大会名・地名など）は `src/engine/config/names.ts` に集約する。
- 試合の結果はエンジンが確率で決める。表示（テキスト・2D・3D）は、エンジンが出したイベントを再生するだけにする。
- 3D（Three.js）のコードは観戦画面を開いたときだけ読み込む（動的 import）。ほかの画面から静的に import しない。3D素材は外部から持ち込まず、コードで作る。
- 状態管理はZustand。保存は `src/lib/save/` に置く（localStorage、スキーマのバージョン管理、JSONの書き出し・読み込み）。
  - セーブデータの形を変えたら、`src/lib/save/migrations.ts` の `SCHEMA_VERSION` を上げてマイグレーション関数を足す。
- UIは横画面で作る（スマホの横向きが基準。縦に持ったときは「横向きにしてください」の画面）。セーフエリアに操作や文字を重ねない。見た目は `docs/DESIGN.md` の基本値に従い、角丸・標準の色・絵文字は使わない。

## コーディング規約

- エンジンのロジックには、Vitestの単体テストを必ず書く。
- 機能単位でこまめにコミットする（メッセージは日本語でよい）。
- 作業の最後に、lint・テスト・ビルド（静的書き出し）がすべて通ることを確認する。

## コマンド

- `npm install`：依存パッケージを入れる
- `npm run dev`：開発サーバー（http://localhost:3000）
- `npm run lint`：ESLint（`src/engine` から React・ブラウザ API・`Math.random` を使うとエラー）
- `npm run typecheck`：TypeScript の型チェック
- `npm run test`：Vitest の単体テスト（`src/**/*.test.ts`）
- `npm run balance:quick`：普段使う軽い版（数十秒）。試合数と年数を減らした参考値で、SPEC 14章の目標値を表で出す
- `npm run balance:full`：すべての検証（20分ほど）。**PR の前に必ず実行する**
  - 大量の試合（`BALANCE_N`。quick 2000／full 10000）
  - 戦術の相性表（`BALANCE_TACTICS_N`。quick 200／full 600。full は戦術の全36通りの確認つき）
  - 格上と戦うときの型ごとの成績（`BALANCE_UNDERDOG_N`。quick 300／full 1500）
  - うまい采配の自動プレイで何年分も進めた評判の推移・同じランクへの勝率・成長・スタッフの入れ替わり（`BALANCE_SEASON_GAMES` 校 × `BALANCE_SEASON_YEARS` 年。quick 8×8／full 72×20。県の区分ごとに同数）
  - Phase 2a：カード・ケガ（`BALANCE_CARDS_N`）、PK 戦とスカウティング（`BALANCE_PK_N`）、作戦ノートあり・なし（`BALANCE_NOTES_N`）、場面の比較：逃げ切り・パワープレイ・疲れた選手の交代（`BALANCE_SCENES_N`）、スタッフなし／最高のスタッフでの成長（`BALANCE_GROWTH_GAMES` × `BALANCE_GROWTH_YEARS`）
  - Phase 3：全国ベスト4・優勝に初めて届いた年と届いた学校の割合、全国大会の優勝校のランク、名門の年の自校のランク、県リーグ（何年目に何部か・昇格／降格・冬の県予選の引退後の降格）
  - Phase 2b：卒業生の特殊能力（プラスの数・金色・両利き）と総合値の分布（評判の推移の卒業生）、スタイル別の貢献と動きの範囲ごとの関与（`BALANCE_P2B_MATCHES`）、1 人のスタイルだけを変えた勝率（`BALANCE_P2B_STYLE_N`）、キャプテンの効果量と金色 1 人の効果（`BALANCE_P2B_TEAM_N`）
- `npm run build`：静的書き出し（`out/` に出力。Vercel はこれを配信する）
