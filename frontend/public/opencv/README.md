# opencv.js (vendored)

このディレクトリの `opencv.js` は OpenCV.js (WebAssembly) のビルド済みバイナリを直接コミットしたもの。
`docs/setup.md` の方針どおり、npmパッケージとしては依存させず、静的アセットとして `public/` 配下に置いている。

- 取得元: `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js`
  （`@techstark/opencv-js` は公式 [docs.opencv.org](https://docs.opencv.org/) のビルドをそのまま
  npm配布しているパッケージ。`docs.opencv.org` 本体は自動取得時にCloudflareのbot対策に阻まれたため、
  同一ビルドを配布しているCDN経由で取得した）
- 取得日: 2026-07-20
- ビルド種別: 非スレッド版（`SharedArrayBuffer` / `Atomics.wait` / `crossOriginIsolated` 不使用を確認済み）。
  スレッド版はCOOP/COEPレスポンスヘッダーが必須になり、GitHub Pages等ヘッダー制御できない静的ホストで
  動かなくなるため、意図的に非スレッド版を選定している（`docs/tech-stack.md` のホスティング候補を参照）。
- WASMバイナリの扱い: `opencv.js` 単体に base64 data URI として埋め込み済み（別途 `.wasm` ファイルは無し）。
- ライセンス: OpenCV本体と同じ Apache License 2.0（`@techstark/opencv-js` も同様）。

## アップグレード方法

新しいバージョンに差し替える場合は、`@techstark/opencv-js` の新しいリリースタグを指定して
`https://cdn.jsdelivr.net/npm/@techstark/opencv-js@<version>/dist/opencv.js` から取得し、このファイルを
置き換えた上でこの README の取得元バージョン・取得日を更新すること。差し替え後は必ず
`npm run test` と `npm run dev` での手動確認（`docs/setup.md`）を行う。
