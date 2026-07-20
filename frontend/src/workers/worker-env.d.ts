/**
 * `tsconfig.json` の `lib` はプロジェクト全体で `dom` を使っている（`webworker` libは
 * 追加していない）。`dom` と `webworker` は `self` 等の型が競合し同一プログラム内で
 * 共存できないため、Workerでのみ必要な `importScripts` だけをここでグローバルに
 * 追加宣言する。`self` 自体は `dom` lib の `Window & typeof globalThis` のままにして
 * おき、Worker側の各ファイルで必要な範囲だけ狭い型にキャストして使う
 * （`workers/worker-types.ts` の `WorkerSelf` を参照）。
 */
declare function importScripts(...urls: (string | URL)[]): void;
