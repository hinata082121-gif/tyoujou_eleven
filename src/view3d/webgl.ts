/** WebGL が使えるか（使えなければ 2D の表示に切り替える。計画 1.2） */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

let cached: boolean | undefined;
/** hasWebGL の結果を覚えておく（画面を描くたびに調べない） */
export function webglSupported(): boolean {
  if (cached === undefined) cached = typeof document !== "undefined" && hasWebGL();
  return cached;
}
