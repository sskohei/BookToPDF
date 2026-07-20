# 開発環境構築手順

> **注意**: 2026-07-20 時点でソースコードは未着手。本ドキュメントは Phase 1 (MVP) 着手時に必要になる手順を
> あらかじめ明記したものであり、プロジェクトの雛形（`package.json` 等）が作成された後に実際に有効になる。
> 雛形作成後は、実際のコマンド・バージョンに合わせてこのドキュメントを更新すること。

## 必要環境

- Node.js（LTS版を推奨。プロジェクト雛形作成時に `.nvmrc` 等でバージョンを固定する）
- npm（Node.js に同梱のもので可。他のパッケージマネージャを使う場合はこのドキュメントを更新する）
- モバイル実機での動作確認用に、iOS Safari / Android Chrome が使える端末（カメラ入力・OpenCV.js WASMの実行速度確認に必要）

## 初回セットアップ（プロジェクト雛形作成時の手順）

```bash
# Next.js（App Router, TypeScript, Tailwind CSS）の雛形を作成
npx create-next-app@latest . --typescript --app --tailwind --eslint

# 依存関係のインストール（雛形作成時に自動実行されない場合）
npm install

# 追加ライブラリ（docs/tech-stack.md 参照）
npm install pdf-lib @dnd-kit/core @dnd-kit/sortable next-pwa
npm install -D vitest @playwright/test

# OpenCV.js は npm パッケージとしてではなく、公式ビルド済み opencv.js を
# public/ 配下に配置するか、Worker内で動的にロードする形を取る
# (詳細は実装時に docs/architecture.md の画像処理パイプラインを参照して決定する)
```

`next.config.ts` に `output: 'export'` を設定し、静的エクスポート構成にする（API Routes/SSRなどの
サーバー機能は使用しない）。

## 開発サーバーの起動

```bash
npm run dev
```

ブラウザで表示されるローカルURLにアクセスし、画像アップロード → 検出 → PDF出力までの流れを確認する。

## テストの実行

```bash
# ユニットテスト（画像処理ロジック・PDF組み立てロジック）
npm run test

# E2Eテスト（アップロード〜PDFダウンロードのフロー）
npx playwright test
```

## ビルド

```bash
npm run build
```

`output: 'export'` の設定により `out/` に静的ファイルが出力される。これをそのまま
Vercel / Cloudflare Pages / GitHub Pages 等にデプロイする。

## 実機での確認

OpenCV.js (WASM) の実行速度と `getUserMedia` によるカメラ起動は端末・ブラウザに強く依存するため、
開発中は定期的に以下を実機で確認する。

- iOS Safari（カメラ起動、処理速度）
- Android Chrome（カメラ起動、処理速度）

開発PC上のブラウザだけでは検出できない不具合（カメラ権限の挙動、処理落ちなど）があるため必須の確認項目とする。
