/**
 * すべてのシミュレーションを順に実行し、reports/ にまとめて書き出す。
 */

import { runBalance, type BalanceReport } from './balance';
import { runDeterminism, type DeterminismReport } from './determinism';
import { runFirstBattle, type FirstBattleReport } from './first-battle';
import { runPerf, type PerfReport } from './perf';
import { runPlacement, type PlacementReport } from './placement';
import { runScaling, type ScalingReport } from './scaling';
import { isMain, round, writeJson, writeText } from './common';

export interface Phase1Report {
  generatedAt: string;
  determinism: DeterminismReport;
  firstBattle: FirstBattleReport;
  placement: PlacementReport;
  balance: BalanceReport;
  scaling: ScalingReport;
  perf: PerfReport;
  pass: boolean;
}

function stage<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  process.stdout.write(`▶ ${label} ... `);
  const r = fn();
  console.log(`done (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  return r;
}

function markdown(rep: Phase1Report): string {
  const d = rep.determinism;
  const f = rep.firstBattle;
  const p = rep.placement;
  const b = rep.balance;
  const s = rep.scaling;
  const perf = rep.perf;
  const ok = (v: boolean): string => (v ? '✅ 合格' : '❌ 不合格');

  const lines: string[] = [];
  lines.push('# フェーズ1 シミュレーション結果');
  lines.push('');
  lines.push(`生成日時: ${rep.generatedAt}`);
  lines.push('');
  lines.push('## まとめ');
  lines.push('');
  lines.push('| 項目 | 結果 | 合格条件 | 判定 |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(
    `| 決定論 | ${d.matched}/${d.total} 一致 | 1,000/1,000 一致 | ${ok(d.pass)} |`,
  );
  lines.push(
    `| 初戦（E0・8体×14マス） | 勝率 ${f.winRate}%（${f.wins}/${f.total}） | 勝率 100% | ${ok(f.pass)} |`,
  );
  lines.push(
    `| 配置で勝敗が変わる | ${p.encountersInBand}/5 遭遇 | 5遭遇のうち3以上が 20〜80% | ${ok(p.pass)} |`,
  );
  lines.push(
    `| バランス | 平均 ${b.avgDuration}s／時間切れ率 ${b.timeoutRate}% | 合格条件なし | — |`,
  );
  lines.push(
    `| スケーリング | 燃焼ビルドの秒間ダメージ ${s.maxDpsRatio}倍 | 合格条件なし | — |`,
  );
  lines.push(
    `| 性能 | ${perf.battles}戦 を ${perf.seconds}s | 合格条件なし | — |`,
  );
  lines.push('');

  lines.push('## 1. 決定論（sim:determinism）');
  lines.push('');
  lines.push(
    `ランダムな戦闘 ${d.total} 件を2回ずつ実行し、イベントログのハッシュを比較した。`,
  );
  lines.push('');
  lines.push(`- 一致: **${d.matched} / ${d.total}**`);
  lines.push(`- 不一致: ${d.mismatches.length} 件`);
  lines.push('');

  lines.push('## 2. 初戦（sim:first-battle）');
  lines.push('');
  lines.push('8体それぞれ単独（★1・装備なし）で、味方14マスすべてから E0 に挑んだ。');
  lines.push('');
  lines.push('| キャラ | 勝敗 | 平均戦闘時間 |');
  lines.push('| --- | --- | --- |');
  for (const c of f.perCharacter) {
    lines.push(`| ${c.charId} ${c.name} | ${c.wins}/${c.battles} | ${c.avgDuration}s |`);
  }
  lines.push('');
  lines.push(`全体勝率: **${f.winRate}%**`);
  lines.push('');

  lines.push('## 3. 配置（sim:placement）');
  lines.push('');
  lines.push(
    `固定編成（前衛 ${p.frontline.join(' / ')}、サポート ${p.support.join(' / ')}、★1・装備なし・加護なし）で、` +
      `味方14マスから3体を置く全 ${p.perEncounter[0]?.placements ?? 0} 通りを総当たりした。`,
  );
  lines.push('');
  lines.push('| 遭遇 | 勝てる配置 | 勝率 | 20〜80%に収まるか | 平均戦闘時間 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const e of p.perEncounter) {
    lines.push(
      `| ${e.encounter} | ${e.wins}/${e.placements} | ${e.winRate}% | ${e.inBand ? '✅' : '—'} | ${e.avgDuration}s |`,
    );
  }
  lines.push('');
  lines.push(`配置で勝敗が変わった遭遇: **${p.encountersInBand}/5**`);
  lines.push('');
  for (const e of p.perEncounter) {
    if (e.bestPlacement) {
      lines.push(`- ${e.encounter} 最短で勝てた配置: \`${e.bestPlacement}\``);
    }
    if (e.worstPlacement) {
      lines.push(`- ${e.encounter} 負けた配置の例: \`${e.worstPlacement}\``);
    }
  }
  lines.push('');

  lines.push('## 4. バランス（sim:balance）');
  lines.push('');
  lines.push(
    `ランダム編成 ${b.loadouts} 件 × 全 ${b.perEncounter.length} 遭遇 = ${b.battles} 戦。`,
  );
  lines.push('');
  lines.push(`- 平均戦闘時間: **${b.avgDuration}s**`);
  lines.push(`- 時間切れ率: **${b.timeoutRate}%**`);
  lines.push(`- 全体勝率: ${b.overallWinRate}%`);
  lines.push('');
  lines.push('| 遭遇 | 勝率 | 平均戦闘時間 | 時間切れ率 | 味方の平均DPS |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const e of b.perEncounter) {
    lines.push(
      `| ${e.encounter} | ${e.winRate}% | ${e.avgDuration}s | ${e.timeoutRate}% | ${e.avgAllyDps} |`,
    );
  }
  lines.push('');
  lines.push('| 属性 | 平均の秒間ダメージ | 与ダメージのシェア |');
  lines.push('| --- | --- | --- |');
  for (const e of b.dpsByElement) {
    lines.push(`| ${e.element} | ${e.avgDps} | ${e.share}% |`);
  }
  lines.push('');

  lines.push('## 5. スケーリング（sim:scaling）');
  lines.push('');
  lines.push(
    `反撃してこない「計測用の的」に対して、0〜${s.window} 秒の窓で秒間ダメージを測った。`,
  );
  lines.push('');
  lines.push('| 編成 | 秒間ダメージ | うち炎 | 実戦勝率 |');
  lines.push('| --- | --- | --- | --- |');
  for (const bd of s.builds) {
    lines.push(`| ${bd.name} | ${bd.dummyDps} | ${bd.dummyFireDps} | ${bd.winRate}% |`);
  }
  lines.push('');
  lines.push(`最大秒間ダメージの倍率: **${s.maxDpsRatio}倍**（炎分だけなら ${s.fireDpsRatio}倍）`);
  lines.push('');

  lines.push('## 6. 性能（sim:perf）');
  lines.push('');
  lines.push(`- 戦闘数: ${perf.battles}`);
  lines.push(`- 所要時間: **${perf.seconds}s**`);
  lines.push(`- 毎秒の戦闘数: ${perf.battlesPerSecond}`);
  lines.push(`- 1戦あたりの平均: ${perf.avgDuration}s（${perf.avgTicksPerBattle} ティック）`);
  lines.push(`- イベントログの記録: ${perf.logging ? 'あり' : 'なし'}`);
  lines.push('');

  lines.push('## 補足');
  lines.push('');
  lines.push('- 戦闘は 0.1 秒刻みの固定タイムステップ。乱数はシード付き（sfc32）で、系列を 戦闘／ショップ／イベント に分けている。');
  lines.push('- 戦闘中に乱数を使うのは麻痺の阻止判定だけなので、同じ入力なら必ず同じログになる。');
  lines.push('- 時間切れは 40 秒からのサドンデス（毎秒 最大HP の 1% ずつ増加）で、90 秒で強制終了（敗北扱い）。値はすべて設定値。');
  lines.push('');

  return lines.join('\n');
}

export function runAll(): Phase1Report {
  const determinism = stage('sim:determinism', () => runDeterminism(1000));
  const firstBattle = stage('sim:first-battle', () => runFirstBattle());
  const placement = stage('sim:placement', () => runPlacement());
  const balance = stage('sim:balance', () => runBalance(1000));
  const scaling = stage('sim:scaling', () => runScaling());
  const perf = stage('sim:perf', () => runPerf(10000, true));

  return {
    generatedAt: new Date().toISOString(),
    determinism,
    firstBattle,
    placement,
    balance,
    scaling,
    perf,
    pass: determinism.pass && firstBattle.pass && placement.pass,
  };
}

function main(): void {
  const t0 = performance.now();
  const rep = runAll();
  const total = round((performance.now() - t0) / 1000, 1);

  writeJson('sim-determinism.json', rep.determinism);
  writeJson('sim-first-battle.json', rep.firstBattle);
  writeJson('sim-placement.json', rep.placement);
  writeJson('sim-balance.json', rep.balance);
  writeJson('sim-scaling.json', rep.scaling);
  writeJson('sim-perf.json', rep.perf);
  writeJson('phase1-report.json', rep);
  const md = writeText('phase1-report.md', markdown(rep));

  console.log('');
  console.log('================ まとめ ================');
  console.log(`決定論          : ${rep.determinism.matched}/${rep.determinism.total} 一致  ${rep.determinism.pass ? 'OK' : 'NG'}`);
  console.log(`初戦勝率        : ${rep.firstBattle.winRate}%  ${rep.firstBattle.pass ? 'OK' : 'NG'}`);
  console.log(`配置で勝敗が変化: ${rep.placement.encountersInBand}/5  ${rep.placement.pass ? 'OK' : 'NG'}`);
  console.log(`平均戦闘時間    : ${rep.balance.avgDuration}s（時間切れ率 ${rep.balance.timeoutRate}%）`);
  console.log(`燃焼ビルド倍率  : ${rep.scaling.maxDpsRatio}倍`);
  console.log(`1万戦の所要時間 : ${rep.perf.seconds}s`);
  console.log(`合計実行時間    : ${total}s`);
  console.log(`レポート        : ${md}`);
  console.log('========================================');

  if (!rep.pass) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
