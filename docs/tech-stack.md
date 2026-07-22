# 技術スタックと選定理由

前提: BookToPDF はクライアント完結の Web アプリであり、サーバーサイドのアプリケーションコンポーネントは持たない
（理由は `docs/architecture.md` を参照）。フロントエンドフレームワークにNext.jsを採用しているが、
`output: 'export'` による静的エクスポートのみを使い、API RoutesやSSRなどのサーバー機能は利用しない。

| 領域 | 技術 | 選定理由 |
|---|---|---|
| フロントエンド基盤 | Next.js（App Router）+ TypeScript、`output: 'export'`で静的エクスポート | UI構築のフレームワークとして採用。App Routerのファイルベースルーティング・コンポーネント構成を活かしつつ、静的エクスポートによりAPI Routes/SSRなどのサーバー機能を使わずサーバー不要の構成を維持できる。TypeScriptで画像処理ロジックの型安全性を確保。 |
| スタイリング | Tailwind CSS | ユーティリティクラスでUIを素早く組める。カメラ/プレビュー中心のUIはカスタムスタイルが多くなりがちなため、コンポーネント単位でスタイルを閉じ込めやすい点も有利。 |
| 画像処理 | OpenCV.js (WebAssembly) | 輪郭検出（`findContours`）、透視変換（`getPerspectiveTransform`/`warpPerspective`）、Hough変換、CLAHEなど、スキャンアプリ相当の画像処理をブラウザ内で実現できる、事実上唯一の現実的な選択肢。ネイティブOpenCVと同等のAPIをWASM経由で利用できる。 |
| 重処理の実行場所 | Web Worker | OpenCV.jsの処理は数百ms〜数秒かかることがあり、メインスレッドで実行するとUIがフリーズする。Workerに逃がすことでプレビュー操作などの応答性を保つ。 |
| カメラ/ファイル入力 | `<input type="file" accept="image/*" capture="environment">` / `MediaDevices.getUserMedia` | モバイルではネイティブカメラアプリ相当の起動、PCではファイル選択にフォールバックできる。追加ライブラリ不要でブラウザ標準APIのみで完結する。 |
| ページ並び替えUI | dnd-kit | 複数ページのドラッグ&ドロップ並び替え・削除・回転操作を実装するための軽量なドラッグ&ドロップライブラリ。アクセシビリティ対応も考慮されている。 |
| PDF生成 | pdf-lib | クライアントサイド（ブラウザ/Node両対応）で動作し、画像埋め込み・ページサイズ指定などPDF組み立てに必要な機能を備える。サーバーサイドのPDF生成サービスが不要になる。 |
| PWA化 | next-pwa（または Serwist の Next.js 向け統合） | Service WorkerとWeb App Manifestの生成を自動化。写真を扱うアプリは通信不安定な環境（外出先・図書館など）で使われる可能性が高く、オフライン動作とホーム画面インストールの価値が大きい。静的エクスポート構成でも動作するものを選定する。 |
| ホスティング | Vercel / Cloudflare Pages / GitHub Pages 等（静的エクスポート成果物のホスティング） | サーバーを持たない構成のため、静的ファイル配信のみで運用でき、運用コストがほぼゼロになる。 |
| テスト（ユニット） | Vitest | 画像処理ロジック（`src/lib/cv`）やPDF組み立てロジック（`src/lib/pdf`）を既知の入力画像に対して単体テストする。 |
| テスト（E2E） | Playwright | カメラ入力はファイルアップロードでモックしつつ、アップロード〜検出〜PDFダウンロードまでの一連のUIフローを自動検証する。 |
| テーマ切り替え（ライト/ダーク） | next-themes | `data-theme`属性の切り替え・OS設定（`prefers-color-scheme`）へのデフォルト追従・`localStorage`永続化・SSRとのハイドレーション不整合（FOUC）対策を自前実装せずに済む。Next.jsでのテーマ切り替えの事実上の標準。 |
| 多言語対応（日本語/英語） | 自作の軽量実装（辞書オブジェクト + React Context、`frontend/src/i18n/`） | 現時点では文言数が少なく、専用のi18nライブラリ（next-intl等）を導入するほどの複雑さがないため。文言が増え、複数形・日付/数値フォーマットなど本格的な対応が必要になった場合はライブラリ導入を再検討する。 |

## 四隅検出のDL化（検討中・未採用）

実写真（木目調の机・手など背景ノイズを含む）では、classical CV（Canny/Otsu）ベースの`detectCorners`が
誤検出しやすいことが繰り返し確認されている。四隅・ページ境界検出に限定してディープラーニングを導入する
案を検討したが、現時点では未採用（実装着手前の技術的な当たりをつけた段階）。導入する場合の方針は以下。

| 項目 | 選定内容 | 理由 |
|---|---|---|
| 推論ランタイム | ONNX Runtime Web (`onnxruntime-web`) | v1.19以降スレッド版WASMのみ配布だが、`crossOriginIsolated`が`false`（COOP/COEP未設定）の環境では自動的に`numThreads=1`にフォールバックして動作するため、GitHub Pages/Vercel静的エクスポート/Cloudflare Pagesなど独自HTTPヘッダーを設定できない現行の静的ホスティング構成のままで使える。TensorFlow.jsも同様の非スレッドフォールバックを持つが、候補モデルがPyTorch→ONNXエクスポート前提で配布されているためONNX Runtime Webを選ぶ。 |
| 実行プロバイダ | WASMを既定・必須経路、WebGPUは任意のオプトイン | iOS Safari(WebKit)でONNX Runtime WebのWebGPU/JSEP実行時に約500推論後のクラッシュ・メモリが14GB超まで膨張する不具合報告があり（[microsoft/onnxruntime#27584](https://github.com/microsoft/onnxruntime/issues/27584)、[#26827](https://github.com/microsoft/onnxruntime/issues/26827)）、四隅検出程度の小さな単発CNNならWASM単体でも十分な速度が見込めるため安定性を優先する。 |
| モデル（第一候補） | [DocAligner](https://github.com/DocsaidLab/DocAligner)（Apache-2.0） | 4隅のヒートマップ回帰（PP-LCNet/FastViT/MobileNetV2 + BiFPNバックボーン）で、出力形式が既存の`Corners`型にそのまま対応させやすい。ライセンスも商用利用可能（帰属表示は必要）。PyTorch→ONNXエクスポート・ONNX Runtime推論が公式に文書化されている。モデルの実サイズは未公開のため導入検討時にダウンロードして確認する。 |
| モデル（参考） | [MakeACopy](https://github.com/egdels/makeacopy)（Apache-2.0、ONNXモデル使用） | 現状Android向け（ONNX Runtime Mobile）での利用が確認されているのみで、ブラウザ（onnxruntime-web）での動作実績は未確認。参考実装候補として記録するに留める。 |
| ファインチューニング用データセット | [SmartDoc 2015 Challenge 1](https://github.com/jchazalon/smartdoc15-ch1-dataset)（CC BY 4.0） | 雑然とした背景でのスマホ撮影＋四隅アノテーションで、本アプリのユースケースに最も近い公開データセット。本アプリはクライアント完結でユーザー写真を収集する経路が無いため、ファインチューニングが必要な場合は公開データセットのみが選択肢になる。MIDV-500/MIDV-2019はより文書種類が豊富だが、データセット全体としてのライセンス表記が明確に確認できず利用前に個別確認が必要。 |

**フルページdewarping（見開き綴じ目の湾曲補正）へのDL導入は明確に不採用**とする。DewarpNet・UVDoc（いずれもMIT、商用利用可）等の研究モデルが存在するが、四隅検出用の軽量バックボーンと比べ数千万パラメータ級（例: DocTrで約2690万パラメータ、fp32で約108MB）と大幅に重く、ブラウザでの安定動作・初回ロード体験の面でリスクが大きい。また代表的なモデルの一つである[DocTr](https://github.com/fh2019ustc/DocTr)は非商用ライセンス（商用利用には著者への別途連絡が必要）であり、そのまま採用できない。既存の`dewarpPage`（綴じ目付近の二次曲線フィット＋ルールドサーフェス変形、`docs/architecture.md`参照）で当面は代替する。

導入する場合は、推論をWeb Worker内（既存の`cv.worker.ts`と同じ場所）で行いサーバー送信を発生させないこと、モデルロード失敗・低信頼度時は既存のclassical CVパイプラインにフォールバックすること、フィーチャーフラグ的に切り替え可能にして既存パイプラインと並行比較しながら段階的に切り替えることを前提とする。

## 採用しなかった選択肢と理由

- **サーバーサイド処理（Python + OpenCV）**: 高精度なアルゴリズムやOCRなどの拡張はしやすいが、
  サーバー運用・画像アップロードに伴うプライバシー配慮・ストレージ管理といった運用負担が増える。
  今回はプライバシーと運用コストを優先し不採用。将来的に処理精度や速度がクライアント完結では
  不十分と判明した場合に再検討する。
- **ハイブリッド構成**: 基本はクライアント、重い処理のみサーバーに委ねる構成も検討したが、
  構成が複雑になる割にメリットが小さいため見送った。
- **フルページdewarpingのDLモデル（DocTr等）**: 上記「四隅検出のDL化」の節を参照。モデルサイズ・
  ライセンス制約の面で現時点では不採用。
