import type { CvModule } from "../lib/cv/opencv-types";
import { getWorkerSelf } from "./worker-types";

const OPENCV_URL = "/opencv/opencv.js";

/**
 * ベンダリングしているビルド（Emscripten MODULARIZE出力）は `cv` オブジェクト自身に
 * `.then` が生えている（内部のreadyPromiseに由来）。この `cv` オブジェクトをPromiseの
 * 解決値・`.then()`コールバックの戻り値・async関数のreturn値など、ネイティブPromiseの
 * 解決手続きを一度でも通してしまうと、`.then` を持つ値＝thenableとして扱われ、
 * `cv.then(...)` の解決を待とうとして永久にpendingになる（実装時に実際に検証して
 * 確認した挙動）。そのため `loadOpenCv()` は `cv` を直接resolveせず、常にこの型で
 * 包んだまま受け渡しし、呼び出し側は `await` した後にプロパティアクセスとして
 * `.cv` を取り出す（`.then` 等の別のPromise解決ステップを経由させない）。
 */
export type CvModuleBox = { cv: CvModule };

let cvBoxPromise: Promise<CvModuleBox> | undefined;

/**
 * OpenCV.js (WASM) をWorker内に読み込み、初期化完了を待つ。
 * 複数回呼んでも読み込みは1回だけ（Promiseをメモ化）。
 *
 * `importScripts` はクラシックWorker（`new Worker(url)` に `{ type: "module" }` を
 * 付けない形）でのみ使える。cv.worker.ts 側でその前提を守っている。
 *
 * 戻り値は `CvModuleBox`（`{ cv: CvModule }`）。呼び出し側は
 * `const { cv } = await loadOpenCv();` のように分割代入でアンラップすること
 * （`.then(cv => ...)` や `(await loadOpenCv()).cv` を返すような、`cv` を別の
 * Promise解決ステップに通す書き方はしない）。
 */
export function loadOpenCv(): Promise<CvModuleBox> {
  if (!cvBoxPromise) {
    cvBoxPromise = new Promise<CvModuleBox>((resolve, reject) => {
      try {
        importScripts(OPENCV_URL);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const cvGlobal = getWorkerSelf().cv as
        | (CvModule & { onRuntimeInitialized?: () => void })
        | undefined;
      if (!cvGlobal) {
        reject(new Error(`opencv.js loaded but did not define a global 'cv' (${OPENCV_URL})`));
        return;
      }

      cvGlobal.onRuntimeInitialized = () => resolve({ cv: cvGlobal });
    });
  }
  return cvBoxPromise;
}
