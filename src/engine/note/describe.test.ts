import { describe, expect, it } from "vitest";
import { templateRule } from ".";
import { describeRule } from "./describe";
import { abilityGrade, bestRole, staffComment } from "../staff/comment";

describe("作戦ノートの文章", () => {
  it("テンプレートを 1 行の文章にする", () => {
    const nameOf = () => undefined;
    expect(describeRule(templateRule("powerPlay", "r"), nameOf)).toBe("1点以上ビハインド・残り10分なら、スタミナが最も低い選手を下げて控えの長身FWを入れる、ロングボール主体・攻撃的にする");
    expect(describeRule(templateRule("pkPrep", "r"), nameOf)).toContain("予選・全国大会の試合・同点・残り3分なら");
  });

  it("指定した選手は名前で出し、いなければそう出す", () => {
    const rule = { ...templateRule("fatigueSub", "r"), actions: [{ type: "sub" as const, out: { kind: "player" as const, id: "a" }, in: { kind: "player" as const, id: "b" } }] };
    expect(describeRule(rule, (id) => (id === "a" ? "山田" : undefined))).toContain("山田を下げて（いない選手）を入れる");
  });
});

describe("スタッフの寸評", () => {
  it("一番高い能力を言葉にし、合う役割を出す", () => {
    const ab = { coaching: 30, tactics: 30, gkCoaching: 30, conditioning: 30, scouting: 72 };
    expect(staffComment(ab)).toBe("優秀。相手の分析が得意");
    expect(bestRole(ab)).toBe("analyst");
    expect(abilityGrade(10)).toBe("素人同然");
  });
});
