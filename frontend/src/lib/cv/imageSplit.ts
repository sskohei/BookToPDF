/**
 * 見開き写真を画像中央で固定的に左右2分割する（Phase 1の簡易版。gutter位置に基づく
 * 分割はPhase 2）。OpenCVを使わない純粋なピクセルコピーなので、Web Worker外(メインスレッド)
 * からも直接呼び出せる。
 */
export function splitImageDataInHalf(imageData: ImageData): [ImageData, ImageData] {
  const { width, height, data } = imageData;
  const leftWidth = Math.floor(width / 2);
  const rightWidth = width - leftWidth;
  const leftData = new Uint8ClampedArray(leftWidth * height * 4);
  const rightData = new Uint8ClampedArray(rightWidth * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    const splitAt = rowStart + leftWidth * 4;
    leftData.set(data.subarray(rowStart, splitAt), y * leftWidth * 4);
    rightData.set(data.subarray(splitAt, rowStart + width * 4), y * rightWidth * 4);
  }

  return [new ImageData(leftData, leftWidth, height), new ImageData(rightData, rightWidth, height)];
}
