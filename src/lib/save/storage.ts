/**
 * 保存先の抽象化。今は localStorage だが、容量が足りなくなったら
 * 同じインターフェースで IndexedDB に差し替える（SPEC 12章）。
 */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  async get(key: string) {
    return window.localStorage.getItem(key);
  }
  async set(key: string, value: string) {
    window.localStorage.setItem(key, value);
  }
  async remove(key: string) {
    window.localStorage.removeItem(key);
  }
}

/** テスト用 */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async remove(key: string) {
    this.data.delete(key);
  }
}
