/**
 * 二択イベント。データを足すだけで増やせる形にしてある。
 *
 * - 章の最初のイベントは、safeOnly: true のものから選ぶ（両方とも安全）
 * - 2回目以降は safeOnly: false（安全 vs 賭け／ミニ戦闘）から選ぶ
 */

import { z } from 'zod';

/** 選択肢で手に入るもの */
export type Reward =
  | { kind: 'none' }
  | { kind: 'coins'; amount: number }
  | { kind: 'equipment' }
  | { kind: 'blessing' }
  | { kind: 'character' }
  /** 所持キャラ1体を★アップ */
  | { kind: 'star' }
  | { kind: 'life'; amount: number }
  /** 6体目枠 */
  | { kind: 'sixthSlot' }
  /** 昇格（サポート枠 → 前衛枠） */
  | { kind: 'promotion' };

/** 賭けに負けた時に失うもの（キャラは絶対に失わない） */
export type Penalty = 'life' | 'equipment' | 'blessing' | 'coinsHalf';

export interface EventChoice {
  id: string;
  label: string;
  /** 安全な選択肢か */
  safe: boolean;
  /** 安全な選択肢の報酬、または賭けの成功報酬 */
  reward: Reward;
  /** 賭け（safe: false のとき） */
  gamble?: {
    /** 成功する確率（0〜1） */
    chance: number;
    /** 失敗した時に失う候補（この中から1つ） */
    penalties: Penalty[];
  };
  /** ミニ戦闘（safe: false のとき） */
  battle?: {
    encounterId: string;
    /** 危険なミニ戦闘か（false なら負けてもライフは減らない） */
    dangerous: boolean;
  };
  successText: string;
  failText?: string;
}

export interface EventDef {
  id: string;
  name: string;
  text: string;
  /** 両方とも安全な二択か（章の最初のイベント用） */
  safeOnly: boolean;
  choices: [EventChoice, EventChoice];
}

const raw: EventDef[] = [
  // ---------------------------------------------------- 章の最初（両方安全）
  {
    id: 'ev_shrine',
    name: '忘れられた祠（仮）',
    text: '苔むした祠に、ふたつの供物台がある。どちらに手を伸ばす？',
    safeOnly: true,
    choices: [
      {
        id: 'a',
        label: '仲間を呼ぶ',
        safe: true,
        reward: { kind: 'character' },
        successText: '祠の奥から、ひとりの英雄が歩み出た。',
      },
      {
        id: 'b',
        label: '力を借りる',
        safe: true,
        reward: { kind: 'star' },
        successText: '仲間のひとりが、祠の加護でひとまわり強くなった。',
      },
    ],
  },
  {
    id: 'ev_caravan',
    name: '行商の荷車（仮）',
    text: '荷車が横転している。行商は礼にどちらか選ばせてくれた。',
    safeOnly: true,
    choices: [
      {
        id: 'a',
        label: '装備をもらう',
        safe: true,
        reward: { kind: 'equipment' },
        successText: '荷の中から、使えそうな装備をひとつ受け取った。',
      },
      {
        id: 'b',
        label: 'コインをもらう',
        safe: true,
        reward: { kind: 'coins', amount: 8 },
        successText: '行商は気前よくコインを握らせてくれた。',
      },
    ],
  },
  {
    id: 'ev_oracle',
    name: '託宣の煙（仮）',
    text: '立ちのぼる煙が、ふたつの形をとった。',
    safeOnly: true,
    choices: [
      {
        id: 'a',
        label: '神の声を聞く',
        safe: true,
        reward: { kind: 'blessing' },
        successText: '煙は加護のかたちになって、チームに宿った。',
      },
      {
        id: 'b',
        label: '路銀を受け取る',
        safe: true,
        reward: { kind: 'coins', amount: 6 },
        successText: '足元にコインがこぼれ落ちた。',
      },
    ],
  },

  // ------------------------------------------- 2回目以降（安全 vs 危険）
  {
    id: 'ev_gamble_altar',
    name: '賭けの祭壇（仮）',
    text: '祭壇は「差し出す者にだけ報いる」と告げている。',
    safeOnly: false,
    choices: [
      {
        id: 'a',
        label: '安全に受け取る',
        safe: true,
        reward: { kind: 'coins', amount: 5 },
        successText: '控えめな供物を受け取り、静かに立ち去った。',
      },
      {
        id: 'b',
        label: '賭ける',
        safe: false,
        reward: { kind: 'blessing' },
        gamble: { chance: 0.55, penalties: ['coinsHalf', 'equipment'] },
        successText: '祭壇は応えた。強力な加護が降りてきた。',
        failText: '祭壇は沈黙した。代償だけが残る。',
      },
    ],
  },
  {
    id: 'ev_gamble_vault',
    name: '封じられた宝庫（仮）',
    text: '重い扉の奥から、かすかに金属の匂いがする。',
    safeOnly: false,
    choices: [
      {
        id: 'a',
        label: '扉の前の供物を拾う',
        safe: true,
        reward: { kind: 'equipment' },
        successText: '扉の前に置かれていた装備をひとつ手に入れた。',
      },
      {
        id: 'b',
        label: '扉をこじ開ける',
        safe: false,
        reward: { kind: 'sixthSlot' },
        gamble: { chance: 0.45, penalties: ['life', 'blessing', 'coinsHalf'] },
        successText: '宝庫の奥に、六人目を迎える席があった。',
        failText: '仕掛けが作動した。手ひどい代償を払った。',
      },
    ],
  },
  {
    id: 'ev_skirmish',
    name: '街道の小競り合い（仮）',
    text: '前方でふたつの集団がにらみ合っている。',
    safeOnly: false,
    choices: [
      {
        id: 'a',
        label: '見物して立ち去る',
        safe: true,
        reward: { kind: 'coins', amount: 4 },
        successText: '巻き込まれずに、落ちていたコインだけ拾った。',
      },
      {
        id: 'b',
        label: '弱い方に加勢する（ミニ戦闘）',
        safe: false,
        reward: { kind: 'promotion' },
        battle: { encounterId: 'E1', dangerous: false },
        successText: '加勢は歓迎された。隊列の組み替えを学んだ。',
        failText: '深追いはせず引き返した。得るものはなかった。',
      },
    ],
  },
  {
    id: 'ev_ambush',
    name: '危険な待ち伏せ（仮）',
    text: '茂みの向こうに、明らかに格上の気配がある。',
    safeOnly: false,
    choices: [
      {
        id: 'a',
        label: '迂回する',
        safe: true,
        reward: { kind: 'coins', amount: 3 },
        successText: '遠回りしたが、道すがら小銭を拾った。',
      },
      {
        id: 'b',
        label: '討ち取る（危険なミニ戦闘）',
        safe: false,
        reward: { kind: 'blessing' },
        battle: { encounterId: 'E4', dangerous: true },
        successText: '待ち伏せを返り討ちにし、加護を勝ち取った。',
        failText: '手痛い反撃を受けた。',
      },
    ],
  },
];

const zReward = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('coins'), amount: z.number().positive() }),
  z.object({ kind: z.literal('equipment') }),
  z.object({ kind: z.literal('blessing') }),
  z.object({ kind: z.literal('character') }),
  z.object({ kind: z.literal('star') }),
  z.object({ kind: z.literal('life'), amount: z.number().positive() }),
  z.object({ kind: z.literal('sixthSlot') }),
  z.object({ kind: z.literal('promotion') }),
]);

const zChoice = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(30),
  safe: z.boolean(),
  reward: zReward,
  gamble: z
    .object({
      chance: z.number().min(0).max(1),
      penalties: z.array(z.enum(['life', 'equipment', 'blessing', 'coinsHalf'])).min(1),
    })
    .optional(),
  battle: z
    .object({ encounterId: z.string().min(1), dangerous: z.boolean() })
    .optional(),
  successText: z.string().min(1),
  failText: z.string().optional(),
});

export const zEventDef: z.ZodType<EventDef> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1),
  safeOnly: z.boolean(),
  choices: z.tuple([zChoice, zChoice]),
}) as z.ZodType<EventDef>;

export const EVENTS: readonly EventDef[] = raw.map((e, i) => {
  const r = zEventDef.safeParse(e);
  if (!r.success) {
    throw new Error(`EVENTS[${i}] のデータ検証に失敗: ${JSON.stringify(r.error.issues)}`);
  }
  return r.data;
});

export const SAFE_EVENTS: readonly EventDef[] = EVENTS.filter((e) => e.safeOnly);
export const RISKY_EVENTS: readonly EventDef[] = EVENTS.filter((e) => !e.safeOnly);

export const EVENT_BY_ID: ReadonlyMap<string, EventDef> = new Map(EVENTS.map((e) => [e.id, e]));

export function getEvent(id: string): EventDef {
  const e = EVENT_BY_ID.get(id);
  if (!e) throw new Error(`未知のイベントID: ${id}`);
  return e;
}
