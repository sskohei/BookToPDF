import type { GutterLine } from "./geometry";

/**
 * 見開き写真を綴じ目の直線(`gutter.ts`の`findGutterLine`で算出する`GutterLine`。手持ち撮影による
 * 回転で綴じ目が斜めになっている場合、`topX`と`bottomX`は異なる値になる)で左右2分割する。
 * 斜めの場合、左右の出力は`[min(topX,bottomX), max(topX,bottomX))`の帯を重複して含む
 * (`topX === bottomX`なら重複のない、従来通りの分割になる)。この重なりのおかげで、後段で
 * 各半分を独立に再度四隅検出する処理が、回転した本当のページ端をどちらの半分でも取りこぼさずに
 * 済む(単純に`x=splitX`で機械的に割ると、行によっては本来その半分に属するピクセルがもう片方に
 * 取り込まれ、後から取り返せなくなる)。OpenCVを使わない純粋なピクセルコピーなので、
 * Web Worker外(メインスレッド)からも直接呼び出せる。
 */
export function splitImageDataAt(imageData: ImageData, gutterLine: GutterLine): [ImageData, ImageData] {
  const { width, height, data } = imageData;
  const clamp = (x: number): number => Math.min(width - 1, Math.max(1, Math.round(x)));
  const minX = clamp(Math.min(gutterLine.topX, gutterLine.bottomX));
  const maxX = Math.max(minX, clamp(Math.max(gutterLine.topX, gutterLine.bottomX)));

  const leftWidth = maxX;
  const rightStart = minX;
  const rightWidth = width - rightStart;
  const leftData = new Uint8ClampedArray(leftWidth * height * 4);
  const rightData = new Uint8ClampedArray(rightWidth * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    leftData.set(data.subarray(rowStart, rowStart + leftWidth * 4), y * leftWidth * 4);
    rightData.set(data.subarray(rowStart + rightStart * 4, rowStart + width * 4), y * rightWidth * 4);
  }

  return [new ImageData(leftData, leftWidth, height), new ImageData(rightData, rightWidth, height)];
}
