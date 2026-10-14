/**
 * 画面のデザインの決まり（docs/DESIGN.md 1 章）を src の中で確かめる：角丸・Tailwind の標準の色・絵文字を使っていないこと
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const SOURCES = files(ROOT).map((path) => ({ path: path.slice(ROOT.length + 1), text: readFileSync(path, "utf8") }));

/** 一致した行を「ファイル:行 内容」で返す */
function hits(re: RegExp, only?: RegExp): string[] {
  const out: string[] = [];
  for (const f of SOURCES) {
    if (only && !only.test(f.path)) continue;
    f.text.split("\n").forEach((line, i) => {
      if (re.test(line)) out.push(`${f.path}:${i + 1} ${line.trim().slice(0, 80)}`);
    });
  }
  return out;
}

describe("デザインの決まり", () => {
  it("絵文字を使っていない（記号の ◎ ○ △ × は可）", () => {
    // 絵文字の範囲・その他の記号（★ ✓ など）・異体字セレクタ
    expect(hits(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u)).toEqual([]);
  });

  it("角丸のクラスを使っていない（2px までの rounded-sm は可）", () => {
    expect(hits(/\brounded(?!-sm\b)(-[a-z0-9[\]]+)?\b/, /\.tsx$/)).toEqual([]);
  });

  it("Tailwind の標準の色を使っていない", () => {
    const palette = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
    const re = new RegExp(`\\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|shadow|divide|accent|caret|decoration)-(?:${palette})-\\d{2,3}\\b`);
    expect(hits(re, /\.tsx$/)).toEqual([]);
  });
});
