/**
 * シード付き疑似乱数（sfc32）。
 * 内部状態は number[4] で、そのままセーブデータに入れられる。
 * ゲーム内の乱数はすべてこれを使う（Math.random は使わない）。
 */
export type RngState = [number, number, number, number];

/** 文字列・数値のシードを 32bit ハッシュにする（cyrb128 の簡略版） */
function hashSeed(seed: string): RngState {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** シードから作る。同じシードなら同じ乱数列になる */
  static fromSeed(seed: string | number): Rng {
    const r = new Rng(hashSeed(String(seed)));
    // 初期の偏りを捨てる
    for (let i = 0; i < 15; i++) r.nextUint();
    return r;
  }

  /** 保存しておいた状態から再開する */
  static fromState(state: RngState): Rng {
    return new Rng([state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0]);
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  private nextUint(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) の一様乱数 */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  /** [min, max] の整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [min, max) の実数 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 確率 p で true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from empty array");
    return items[Math.floor(this.next() * items.length)];
  }

  /** 重み付きの抽選。重みが全部 0 なら先頭を返す */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  /** 正規分布（Box-Muller） */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** ポアソン分布（λ が小さい前提の Knuth 法） */
  poisson(lambda: number): number {
    const l = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > l);
    return k - 1;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** 別系統の乱数を派生させる（試合ごとの乱数など） */
  fork(label = ""): Rng {
    return Rng.fromSeed(`${this.nextUint()}:${this.nextUint()}:${label}`);
  }

  /** 一意な ID 用の短い文字列 */
  id(prefix: string): string {
    return `${prefix}${this.nextUint().toString(36)}${this.nextUint().toString(36).slice(0, 3)}`;
  }
}
