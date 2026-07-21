/**
 * 見開き写真を指定したx座標(綴じ目位置。呼び出し側が`gutter.ts`の`findGutterX`で算出する)で
 * 左右2分割する。OpenCVを使わない純粋なピクセルコピーなので、Web Worker外(メインスレッド)
 * からも直接呼び出せる。
 */
export function splitImageDataAt(imageData: ImageData, splitX: number): [ImageData, ImageData] {
  const { width, height, data } = imageData;
  const leftWidth = Math.min(Math.max(1, Math.round(splitX)), width - 1);
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
