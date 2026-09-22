/**
 * スタイルの下限チェック。
 * - font-size は 14px 以上（ID の表示用クラスだけ 12px を許す）
 * - タップできる要素には 44px 以上の最小サイズが指定されている
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(__dirname, '../src/ui/style.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** ID の表示にだけ 12px を許す */
const ID_CLASSES = ['.char-id', '.mono-id'];

interface Rule {
  selector: string;
  body: string;
}

function parseRules(css: string): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out.push({ selector: m[1]!.trim(), body: m[2]! });
  }
  return out;
}

const RULES = parseRules(CSS);

/** :root の CSS 変数を読む */
function rootVars(): Map<string, string> {
  const vars = new Map<string, string>();
  for (const r of RULES) {
    if (!r.selector.includes(':root')) continue;
    for (const line of r.body.split(';')) {
      const m = /(--[\w-]+)\s*:\s*([^;]+)/.exec(line);
      if (m) vars.set(m[1]!, m[2]!.trim());
    }
  }
  return vars;
}

const VARS = rootVars();

/** `16px` や `var(--font-body)` を px の数値にする */
function toPx(value: string): number | null {
  const v = value.trim();
  const varMatch = /^var\((--[\w-]+)\)$/.exec(v);
  if (varMatch) {
    const resolved = VARS.get(varMatch[1]!);
    return resolved ? toPx(resolved) : null;
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(v);
  return px ? Number(px[1]) : null;
}

function declarations(body: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of body.split(';')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    out.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return out;
}

describe('CSS 変数', () => {
  it('文字サイズとタップ領域が変数で一元管理されている', () => {
    for (const name of ['--font-title', '--font-heading', '--font-body', '--font-sub', '--tap']) {
      expect(VARS.has(name), name).toBe(true);
    }
    expect(toPx(VARS.get('--font-body')!)).toBeGreaterThanOrEqual(16);
    expect(toPx(VARS.get('--font-sub')!)).toBeGreaterThanOrEqual(14);
    expect(toPx(VARS.get('--font-heading')!)).toBeGreaterThanOrEqual(18);
    expect(toPx(VARS.get('--font-title')!)).toBeGreaterThanOrEqual(18);
    expect(toPx(VARS.get('--font-num')!)).toBeGreaterThanOrEqual(16);
    expect(toPx(VARS.get('--tap')!)).toBeGreaterThanOrEqual(44);
  });
});

describe('font-size の下限', () => {
  it('IDの表示用クラス以外に、14px未満の指定がない', () => {
    const bad: string[] = [];
    for (const r of RULES) {
      const isIdRule = ID_CLASSES.some((c) => r.selector.includes(c));
      for (const [prop, value] of declarations(r.body)) {
        if (prop !== 'font-size') continue;
        const px = toPx(value);
        if (px === null) {
          bad.push(`${r.selector} { font-size: ${value} } （px に解決できない）`);
          continue;
        }
        const min = isIdRule ? 12 : 14;
        if (px < min) bad.push(`${r.selector} { font-size: ${value} → ${px}px }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('12px を使っているのは ID の表示用クラスだけ', () => {
    for (const r of RULES) {
      if (r.selector.includes(':root')) continue;
      for (const [prop, value] of declarations(r.body)) {
        if (prop !== 'font-size') continue;
        if (toPx(value) === 12) {
          expect(ID_CLASSES.some((c) => r.selector.includes(c)), r.selector).toBe(true);
        }
      }
    }
  });
});

function ruleFor(selector: string): Rule | undefined {
  return RULES.find((r) => r.selector.replace(/\s+/g, ' ') === selector.replace(/\s+/g, ' '));
}

describe('タップ領域', () => {
  it('ボタンとセレクトに 44px 以上の最小サイズがある', () => {
    for (const sel of ['button', 'select']) {
      const r = ruleFor(sel);
      expect(r, sel).toBeTruthy();
      const d = new Map(declarations(r!.body));
      expect(toPx(d.get('min-height') ?? ''), `${sel} min-height`).toBeGreaterThanOrEqual(44);
      expect(toPx(d.get('min-width') ?? ''), `${sel} min-width`).toBeGreaterThanOrEqual(44);
    }
  });

  it('入力欄と一覧行にも 44px 以上の高さがある', () => {
    for (const sel of ["input[type='text']", '.unit-line', '.char-name', '.skill', '.sheet-list-item']) {
      const r = ruleFor(sel);
      expect(r, sel).toBeTruthy();
      const d = new Map(declarations(r!.body));
      expect(toPx(d.get('min-height') ?? ''), `${sel} min-height`).toBeGreaterThanOrEqual(44);
    }
  });

  it('×ボタンは 44px 四方', () => {
    const d = new Map(declarations(ruleFor('.sheet-close')!.body));
    expect(toPx(d.get('width') ?? '')).toBeGreaterThanOrEqual(44);
    expect(toPx(d.get('height') ?? '')).toBeGreaterThanOrEqual(44);
  });

  it('隣り合うボタンの間隔は 8px 以上', () => {
    expect(toPx(VARS.get('--gap')!)).toBeGreaterThanOrEqual(8);
    for (const sel of ['.row', '.char-sub', '.bottom-bar']) {
      const d = new Map(declarations(ruleFor(sel)!.body));
      const gap = d.get('gap')!;
      expect(toPx(gap), sel).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('横スクロール', () => {
  it('本文の横はみ出しを抑える指定がある', () => {
    const body = new Map(declarations(ruleFor('html,\nbody')?.body ?? RULES.find((r) => r.selector.replace(/\s+/g, '') === 'html,body')!.body));
    expect(body.get('overflow-x')).toBe('hidden');
    const appRule = new Map(declarations(ruleFor('#app')!.body));
    expect(appRule.get('overflow-x')).toBe('hidden');
    expect(appRule.get('max-width')).toBe('430px');
  });
});
