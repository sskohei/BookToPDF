# 開発環境構築手順

Next.js プロジェクトは `frontend/` サブディレクトリにある。以下のコマンドはすべて `frontend/` を
カレントディレクトリとして実行する（`cd frontend` の後に実行する想定）。

## 必要環境

- Node.js（LTS版を推奨。プロジェクト雛形作成時に `.nvmrc` 等でバージョンを固定する）
- npm（Node.js に同梱のもので可。他のパッケージマネージャを使う場合はこのドキュメントを更新する）
- モバイル実機での動作確認用に、iOS Safari / Android Chrome が使える端末（カメラ入力・OpenCV.js WASMの実行速度確認に必要）

## 初回セットアップ

`frontend/` の雛形（Next.js App Router, TypeScript, Tailwind CSS, ESLint, Vitest, Playwright）は
セットアップ済み（issue #2）。クローン後は依存関係をインストールするだけでよい。

```bash
cd frontend
npm install
```

Phase 1 以降で必要になる追加ライブラリ（docs/tech-stack.md 参照）はまだ未導入のため、該当issue着手時に
以下のようにインストールする。

```bash
npm install pdf-lib @dnd-kit/core @dnd-kit/sortable next-pwa
```

OpenCV.js は npm パッケージとしては依存させず、`frontend/public/opencv/opencv.js`
（公式ビルド済み・非スレッド版）としてリポジトリに直接コミットしている（issue #4）。
`src/workers/loadOpenCv.ts` が Worker 内で `importScripts` により読み込む。取得元・バージョン・
ライセンス等の来歴は `frontend/public/opencv/README.md` を参照。バージョンを上げる場合も同ファイルの
手順に従う。

`next.config.ts` に `output: 'export'` を設定済み（API Routes/SSRなどのサーバー機能は使用しない）。

## 開発サーバーの起動

```bash
cd frontend
npm run dev
```

ブラウザで表示されるローカルURL（http://localhost:3000）にアクセスし、画像アップロード → 検出 → PDF出力までの流れを確認する。

## テストの実行

```bash
cd frontend

# ユニットテスト（画像処理ロジック・PDF組み立てロジック、Vitest）
npm run test

# E2Eテスト（アップロード〜PDFダウンロードのフロー、Playwright）
npm run test:e2e
```

## ビルド

```bash
cd frontend
npm run build
```

`output: 'export'` の設定により `frontend/out/` に静的ファイルが出力される。これをそのまま
Vercel / Cloudflare Pages / GitHub Pages 等にデプロイする（デプロイ先の Root Directory は `frontend` を指定する）。

## 実機での確認

OpenCV.js (WASM) の実行速度と `getUserMedia` によるカメラ起動は端末・ブラウザに強く依存するため、
開発中は定期的に以下を実機で確認する。

- iOS Safari（カメラ起動、処理速度）
- Android Chrome（カメラ起動、処理速度）

開発PC上のブラウザだけでは検出できない不具合（カメラ権限の挙動、処理落ちなど）があるため必須の確認項目とする。
