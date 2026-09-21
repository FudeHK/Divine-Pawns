# 神話ローグライク × オートバトラー — フェーズ1

「戦闘が面白いか」「配置で勝敗が変わるか」を数値で確かめるための、戦闘エンジンと
シミュレーション一式。画面は検証用の最小限。

## 使い方

```bash
npm install
npm run dev        # 検証用の画面（http://localhost:5173）
npm test           # Vitest
npm run sim:all    # すべてのシミュレーション（結果は reports/ へ）
```

個別のシミュレーション:

```bash
npm run sim:determinism   # 決定論（1,000件×2回のログハッシュ比較）
npm run sim:first-battle  # 初戦（8体×14マス で E0）
npm run sim:placement     # 配置の総当たり（E1〜E4・B1）
npm run sim:balance       # ランダム編成1,000件
npm run sim:scaling       # 燃焼ビルドの倍率
npm run sim:perf          # 10,000戦の所要時間
```

## 構成

```
src/
  engine/   盤面・戦闘ループ・ステータス計算・効果システム・デバフ・乱数・ログ
    types.ts     共通型（効果システムのデータ構造を含む）
    config.ts    設定値（★倍率・デバフ係数・サドンデスなど）
    hex.ts       六角グリッド（odd-r）・距離・BFS
    rng.ts       sfc32 のシード付き乱数（戦闘／ショップ／イベントの3系列）
    stats.ts     ステータス計算・ダメージ式
    debuffs.ts   燃焼・凍傷・猛毒・麻痺
    unit.ts      戦闘中のユニット
    battle.ts    戦闘ループ本体
    build.ts     編成＋遭遇 → 戦闘セットアップ
    log.ts       イベントログとハッシュ
  data/     キャラ・敵・遭遇・装備・加護（zod で検証）
  ui/       検証用の最小画面（DOM + SVG）
  util/     数値の短縮表記など
sim/        シミュレーション用コマンド
reports/    シミュレーション結果（phase1-report.md と JSON）
tests/      Vitest
```

戦闘エンジン（`src/engine`）と データ（`src/data`）は UI・描画に一切依存せず、
Node でもブラウザでも同じ結果になる。

## 戦闘の要点

- 幅5の六角グリッド（odd-r、奇数行が右に半マスずれる）。使えるマスは 28（各陣営 5・4・5）
- 0.1 秒刻みの固定タイムステップ。同じ入力（編成・配置・装備・加護・シード）なら
  イベントログまで完全に一致する
- 戦闘中に乱数を使うのは麻痺の阻止判定のみ
- 敵全滅で勝利、味方全滅で敗北、90 秒で時間切れ（敗北扱い）。40 秒からサドンデス
- スキル・パッシブ・サポート効果・装備・加護は、すべて
  「きっかけ（Trigger）・条件（Condition）・効果（Effect）」の同じデータ形で書く

## フェーズ2 に向けて

- 描画は PixiJS に差し替える（`src/ui/replay.ts` が出す「フレーム列＋ログ」をそのまま渡せる形にしてある）
- ショップ・イベント系列の乱数は用意済み（`RngSet`）
