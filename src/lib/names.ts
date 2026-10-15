/**
 * 名字だけで見せる一覧の表示名（R2 の後）。
 * 名前は「名字 名前」。同じ名字の人が一覧にいれば、名前の頭を足して見分けられるようにする（「石井 龍」）。
 * 名前の 1 文字目も同じなら、その人だけ見分けられるまで文字を増やす（名前まで同じなら名前をすべて出す）
 */
export function shortNames(people: readonly { id: string; name: string }[]): Map<string, string> {
  const split = people.map((p) => {
    const i = p.name.indexOf(" ");
    return { id: p.id, family: i < 0 ? p.name : p.name.slice(0, i), given: i < 0 ? "" : p.name.slice(i + 1) };
  });
  const byFamily = new Map<string, typeof split>();
  for (const s of split) byFamily.set(s.family, [...(byFamily.get(s.family) ?? []), s]);
  const out = new Map<string, string>();
  for (const [family, group] of byFamily) {
    // 同じ人が 2 回入っていても、別の人がいなければ名字だけ
    if (new Set(group.map((s) => s.id)).size < 2) {
      for (const s of group) out.set(s.id, family);
      continue;
    }
    for (const s of group) {
      const chars = [...s.given];
      const pre = (g: string, n: number) => [...g].slice(0, n).join("");
      let len = 1;
      while (len < chars.length && group.some((o) => o.given !== s.given && pre(o.given, len) === pre(s.given, len))) len++;
      out.set(s.id, s.given ? `${family} ${pre(s.given, len)}` : family);
    }
  }
  return out;
}

/** 1 人分の表示名（一覧の人たちと見比べる） */
export function shortName(p: { id: string; name: string }, people: readonly { id: string; name: string }[]): string {
  return shortNames(people).get(p.id) ?? p.name.split(" ")[0];
}
