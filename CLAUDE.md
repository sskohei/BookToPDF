# CLAUDE.md

Claude Code がこのリポジトリで作業する際に参照するプロジェクト概要。詳細は `docs/` を参照。

## プロジェクト概要

BookToPDF は、本を撮影した写真からページ領域を検出し、見開き写真なら左右2ページ・単独ページなら1ページとして
PDFにまとめて出力する Web アプリ。写真を撮影 or アップロード → 自動でページの四隅検出・見開き分割・台形補正・
傾き補正・コントラスト補正 → 必要なら手動微調整 → ページ順を確定して1つのPDFとしてダウンロード、という流れ。

詳しいアプリ概要とユースケースは `docs/architecture.md` を参照。

## 現在の状態

Next.js プロジェクト雛形は `frontend/` サブディレクトリにセットアップ済み（issue #2）。
以降の実装（画像処理・UI・PDF生成など）はすべて `frontend/` 配下で行う。
実装は `docs/roadmap.md` の Phase 1 (MVP) から進める。

## 技術スタックの要点

- **クライアント完結**の Web アプリ。バックエンドAPI・サーバーは持たない。写真は端末外に送信しない。
- フロントエンド: Next.js（App Router）+ TypeScript、`output: 'export'` による静的エクスポート。
  API Routes/SSRなどNext.jsのサーバー機能は使わない。スタイリングは Tailwind CSS
- 画像処理: OpenCV.js (WASM) を Web Worker 上で実行（四隅検出・透視変換・見開き分割・傾き補正・コントラスト補正）
- PDF生成: pdf-lib（クライアントサイドで画像埋め込み）
- ページ並び替えUI: dnd-kit
- PWA化: next-pwa（または Serwist の Next.js 向け統合）
- ホスティング: 静的ホスティング（Vercel / Cloudflare Pages / GitHub Pages 等）

選定理由の詳細は `docs/tech-stack.md` を参照。

## リポジトリ構成の方針

Next.js プロジェクトは `frontend/` サブディレクトリに置く（詳細は `docs/architecture.md`）。

```
frontend/
  app/
    layout.tsx        # ルートレイアウト
    page.tsx           # トップページ（アプリ本体はクライアントコンポーネントとして組み込む）
  src/
    components/       # Capture, PreviewGrid, CornerEditor, PageReorder, ExportButton など（"use client"）
    lib/
      cv/             # OpenCV.js ラッパー、輪郭検出・透視変換・gutter検出ロジック
      pdf/            # pdf-lib を使ったPDF組み立てロジック
    workers/          # OpenCV.js を動かす Web Worker エントリ
    state/            # ページ配列・処理ステータスなどのアプリ状態管理
  public/
    # PWA manifest, opencv.wasm 等の静的アセット
  next.config.ts      # output: 'export' を設定し、静的エクスポート構成にする
docs/                  # 設計ドキュメント（本ファイルと対）
```

`@/*` は `frontend/src/*` を指すエイリアスとして `frontend/tsconfig.json` に設定している。

カメラ/ファイル入力・OpenCV.js・Web Workerを扱うコンポーネントはすべてクライアントコンポーネント
（`"use client"`）とする。サーバーコンポーネントは静的なレイアウト・マークアップ部分のみに限定する。

- 画像処理ロジック（`src/lib/cv`）は UI コンポーネントから独立させ、Vitest で単体テストできる形を保つ。
- 重い画像処理（OpenCV.js呼び出し）は必ず Web Worker 経由で実行し、UIスレッドをブロックしない。
- 新規に外部サービス・サーバーサイド処理を追加する場合は「クライアント完結」という前提から外れるため、
  導入前にこの方針との整合性を確認する。

## 開発時の規約

- TypeScript を使用し、`any` の使用は避ける。
- コンポーネントと画像処理ロジック（`lib/cv`, `lib/pdf`）を分離し、ロジック側はブラウザUIに依存しないテスト可能な形にする。
- 画像処理ロジックの変更には対応する Vitest のユニットテストを添える。
- UI フローの変更（アップロード〜PDFダウンロード）には Playwright の E2E テストを添える。
- コミット規約・ブランチ運用は `docs/contributing.md` を参照。

## ドキュメント一覧

- `docs/architecture.md` — 全体アーキテクチャ・データフロー・画像処理パイプラインの詳細
- `docs/tech-stack.md` — 採用技術と選定理由
- `docs/setup.md` — 開発環境構築手順
- `docs/roadmap.md` — 実装フェーズ（Phase 1〜3）
- `docs/contributing.md` — 複数人開発のためのルール（ブランチ運用・コミット規約・PR）
