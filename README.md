# BookToPDF

本を撮影した写真からページ領域を検出し、**見開き写真なら左右2ページ・単独ページなら1ページ**として
1つのPDFにまとめて出力するWebアプリです。

## 主な特徴

- **自動四隅検出・見開き自動判定**: 写真の中から本のページ境界を自動検出し、見開き写真は綴じ目（gutter）位置で
  自動的に左右2ページへ分割します
- **スキャンアプリ相当の補正**: 台形補正（透視変換）・傾き補正・コントラスト補正など、本格的な画質補正を行います
- **クライアント完結**: 画像処理・PDF生成はすべてブラウザ内で行われ、撮影した写真が端末外（サーバー等）に
  送信されることはありません

## 技術スタック（概要）

- **Next.js**（App Router、`output: 'export'` による静的エクスポート）+ TypeScript + Tailwind CSS
- **OpenCV.js**（WebAssembly）を Web Worker 上で実行し、四隅検出・透視変換・見開き分割などの画像処理を行う
- **pdf-lib** によるクライアントサイドPDF生成
- **dnd-kit** によるページ並び替えUI
- バックエンドAPI・サーバーは持たない構成（静的ホスティングのみで運用）

選定理由の詳細は [`docs/tech-stack.md`](docs/tech-stack.md) を参照してください。

## リポジトリ構成

```
BookToPDF/
├── frontend/    # Next.js アプリ本体（実装はすべてここで行う）
│   ├── app/            # ルートレイアウト・トップページ
│   └── src/
│       ├── components/ # Capture, PreviewGrid, CornerEditor, PageReorder, ExportButton など
│       ├── lib/
│       │   ├── cv/     # OpenCV.js ラッパー、輪郭検出・透視変換・gutter検出ロジック
│       │   └── pdf/    # pdf-lib を使ったPDF組み立てロジック
│       ├── workers/    # OpenCV.js を動かす Web Worker エントリ
│       └── state/      # ページ配列・処理ステータスなどのアプリ状態管理
└── docs/        # 設計ドキュメント
```

全体アーキテクチャ・画像処理パイプラインの詳細は [`docs/architecture.md`](docs/architecture.md) を参照してください。

## 開発の始め方

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` にアクセスして動作を確認できます。テスト・ビルド・デプロイ手順などの詳細は
[`docs/setup.md`](docs/setup.md) を参照してください。

## 現在の状態

設計ドキュメントの整備、および `frontend/` 配下でのNext.jsプロジェクト雛形のセットアップ（静的エクスポート構成、
Vitest/Playwrightの導入）が完了しています。Phase 1 (MVP) の各機能（画像アップロードUI、四隅自動検出、透視補正、
手動微調整UI、ページ並び替え、PDF書き出し）と初回デプロイは、GitHub issueとして起票済みでこれから実装します。

フェーズ全体のスコープは [`docs/roadmap.md`](docs/roadmap.md) を参照してください。

## 開発への参加

ブランチ運用・コミット規約・Pull Requestの出し方は [`docs/contributing.md`](docs/contributing.md) を参照してください。

## ドキュメント一覧

- [`CLAUDE.md`](CLAUDE.md) — プロジェクト概要・開発規約（AIエージェント/開発者共通の起点）
- [`docs/architecture.md`](docs/architecture.md) — 全体アーキテクチャ・データフロー・画像処理パイプラインの詳細
- [`docs/tech-stack.md`](docs/tech-stack.md) — 採用技術と選定理由
- [`docs/setup.md`](docs/setup.md) — 開発環境構築手順
- [`docs/roadmap.md`](docs/roadmap.md) — 実装フェーズ（Phase 1〜3）
- [`docs/contributing.md`](docs/contributing.md) — 複数人開発のためのルール

## ライセンス

[MIT License](LICENSE)
