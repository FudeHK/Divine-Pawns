/**
 * ラン中のオートセーブ（localStorage）。
 * 壊れているデータは安全に捨てて、新規ランに戻せるようにする。
 */

import { RUN_VERSION } from './run';
import type { RunState } from './types';

export const SAVE_KEY = 'divine-pawns.run.v1';

/** localStorage がない環境（テストや SSR）でも落ちないようにする */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements SaveStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function defaultStorage(): SaveStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // アクセスできない環境
  }
  return new MemoryStorage();
}

/** ラン状態を保存する。失敗しても例外は投げない */
export function saveRun(run: RunState, storage: SaveStorage = defaultStorage()): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(run));
    return true;
  } catch {
    return false;
  }
}

function looksLikeRun(v: unknown): v is RunState {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<RunState>;
  return (
    typeof r.seed === 'string' &&
    typeof r.chapter === 'number' &&
    typeof r.nodeIndex === 'number' &&
    typeof r.life === 'number' &&
    typeof r.coins === 'number' &&
    Array.isArray(r.roster) &&
    Array.isArray(r.blessings) &&
    (r.phase === 'node' || r.phase === 'clear' || r.phase === 'gameover')
  );
}

/**
 * 保存されたランを読む。
 * 壊れている・バージョンが違う場合は null を返し、保存を消す。
 */
export function loadRun(storage: SaveStorage = defaultStorage()): RunState | null {
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;

  try {
    const parsed: unknown = JSON.parse(text);
    if (!looksLikeRun(parsed)) throw new Error('形式が違う');
    if (parsed.version !== RUN_VERSION) throw new Error('バージョンが違う');
    return parsed;
  } catch {
    clearRun(storage);
    return null;
  }
}

export function clearRun(storage: SaveStorage = defaultStorage()): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // 何もしない
  }
}

export function hasSavedRun(storage: SaveStorage = defaultStorage()): boolean {
  return loadRun(storage) !== null;
}
