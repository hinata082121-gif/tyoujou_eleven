import { describe, expect, it } from "vitest";
import { shortName, shortNames } from "./names";

describe("名字だけの表示名", () => {
  it("同じ名字がいなければ名字だけ", () => {
    const m = shortNames([
      { id: "a", name: "石井 龍之介" },
      { id: "b", name: "加藤 翔" },
    ]);
    expect(m.get("a")).toBe("石井");
    expect(m.get("b")).toBe("加藤");
  });
  it("同じ名字がいれば、名前の 1 文字目を足す", () => {
    const m = shortNames([
      { id: "a", name: "石井 龍之介" },
      { id: "b", name: "石井 大輝" },
      { id: "c", name: "加藤 翔" },
    ]);
    expect(m.get("a")).toBe("石井 龍");
    expect(m.get("b")).toBe("石井 大");
    expect(m.get("c")).toBe("加藤");
  });
  it("名前の 1 文字目も同じなら、見分けられるまで増やす", () => {
    const m = shortNames([
      { id: "a", name: "石井 龍之介" },
      { id: "b", name: "石井 龍也" },
      { id: "c", name: "石井 大輝" },
    ]);
    expect(m.get("a")).toBe("石井 龍之");
    expect(m.get("b")).toBe("石井 龍也");
    expect(m.get("c")).toBe("石井 大");
  });
  it("名前まで同じ人は、名前をすべて出す", () => {
    const m = shortNames([
      { id: "a", name: "石井 翔" },
      { id: "b", name: "石井 翔" },
    ]);
    expect(m.get("a")).toBe("石井 翔");
    expect(m.get("b")).toBe("石井 翔");
  });
  it("1 人分", () => {
    const all = [
      { id: "a", name: "石井 龍之介" },
      { id: "b", name: "石井 大輝" },
    ];
    expect(shortName(all[1], all)).toBe("石井 大");
  });
});
