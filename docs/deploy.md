# 公開URLで遊べるようにする

このゲームはブラウザだけで完結する（サーバー不要・保存は `localStorage`）ので、
静的ホスティングに置くだけでスマホから URL を開いて遊べる。
PC を起動しておく必要も、同じ Wi-Fi につなぐ必要もない。

## 準備（済み）

- `vite.config.ts` の `base: './'`（相対パスで出力するので、どのURLの下に置いても動く）
- `vercel.json` … Vercel 用の設定
- `netlify.toml` … Netlify 用の設定
- ビルド出力先: `dist/`

## Vercel に出す（おすすめ）

```bash
npm i -g vercel
vercel login          # ブラウザが開くので、そこでログインする
vercel --prod         # 初回は質問に答える（すべて既定のままでよい）
```

最後に `https://<プロジェクト名>.vercel.app` のような URL が表示される。
スマホのブラウザでその URL を開けばそのまま遊べる。

## Netlify に出す場合

```bash
npm i -g netlify-cli
netlify login         # ブラウザが開くので、そこでログインする
npm run build
netlify deploy --prod --dir=dist
```

## GitHub と連携する場合

Vercel / Netlify のダッシュボードでこのリポジトリを選ぶだけでよい。
設定は `vercel.json` / `netlify.toml` から自動で読まれる。

- ビルドコマンド: `npm run build`
- 公開ディレクトリ: `dist`

## 確認

```bash
npm run build     # dist/ ができる
npm run preview   # ビルド結果をローカルで確認（http://localhost:4173）
```
