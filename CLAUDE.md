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

- **Phase 1**（SPEC.md 13章を参照）

## アーキテクチャの原則

- Next.js（App Router）＋TypeScript（strictモード）。`output: 'export'` による静的書き出しのみで動かす。API Routes・SSR・Server Actionsは使わない。
- `src/engine/` はUIから独立した純粋なTypeScriptにする。React・DOM・ブラウザAPIをimportしない。
- 乱数は必ず `src/engine/rng` のシード付き疑似乱数を使う。`Math.random()` は使わない。
- バランス調整用の数値は `src/engine/config/` に集約する。マジックナンバーを散らばらせない。
- 表示名（大会名・地名など）は `src/engine/config/names.ts` に集約する。
- 試合の結果はエンジンが確率で決める。表示（テキスト・2D・3D）は、エンジンが出したイベントを再生するだけにする。
- 状態管理はZustand。保存は `src/lib/save/` に置く（localStorage、スキーマのバージョン管理、JSONの書き出し・読み込み）。
  - セーブデータの形を変えたら、`src/lib/save/migrations.ts` の `SCHEMA_VERSION` を上げてマイグレーション関数を足す。
- UIはスマホ縦画面を最優先にする。

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
- `npm run balance`：SPEC 14章の目標値を表で出す（6分ほどかかる）
  - 大量の試合（`BALANCE_N`、既定 10000）
  - 戦術の相性表（`BALANCE_TACTICS_N`、既定 600）
  - うまい采配の自動プレイで何年分も進めた評判の推移・同じランクへの勝率・成長（`BALANCE_SEASON_GAMES` 校 × `BALANCE_SEASON_YEARS` 年、既定 20 × 12）
- `npm run build`：静的書き出し（`out/` に出力。Vercel はこれを配信する）
