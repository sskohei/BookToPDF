import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitImageDataAt } from "./imageSplit";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** pixel i (row-major) gets R=i, G=100+i, B=200+i, A=255, so each pixel is identifiable. */
function makeImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = i;
    data[i * 4 + 1] = 100 + i;
    data[i * 4 + 2] = 200 + i;
    data[i * 4 + 3] = 255;
  }
  return new FakeImageData(data, width, height) as unknown as ImageData;
}

function pixelsOf(imageData: ImageData): number[][] {
  const pixels: number[][] = [];
  for (let i = 0; i < imageData.width * imageData.height; i++) {
    pixels.push(Array.from(imageData.data.slice(i * 4, i * 4 + 4)));
  }
  return pixels;
}

describe("splitImageDataAt", () => {
  it("splits at the given x, row by row", () => {
    const imageData = makeImageData(4, 2);

    const [left, right] = splitImageDataAt(imageData, 2);

    expect(left.width).toBe(2);
    expect(right.width).toBe(2);
    expect(left.height).toBe(2);
    expect(right.height).toBe(2);
    // row 0: pixels 0,1 | 2,3 — row 1: pixels 4,5 | 6,7
    expect(pixelsOf(left)).toEqual([
      [0, 100, 200, 255],
      [1, 101, 201, 255],
      [4, 104, 204, 255],
      [5, 105, 205, 255],
    ]);
    expect(pixelsOf(right)).toEqual([
      [2, 102, 202, 255],
      [3, 103, 203, 255],
      [6, 106, 206, 255],
      [7, 107, 207, 255],
    ]);
  });

  it("splits at an arbitrary, non-center x", () => {
    const imageData = makeImageData(5, 1);

    const [left, right] = splitImageDataAt(imageData, 3);

    expect(left.width).toBe(3);
    expect(right.width).toBe(2);
    expect(pixelsOf(left)).toEqual([
      [0, 100, 200, 255],
      [1, 101, 201, 255],
      [2, 102, 202, 255],
    ]);
    expect(pixelsOf(right)).toEqual([
      [3, 103, 203, 255],
      [4, 104, 204, 255],
    ]);
  });

  it("clamps the split x so both halves are at least 1px wide", () => {
    const imageData = makeImageData(4, 1);

    const [left, right] = splitImageDataAt(imageData, 0);

    expect(left.width).toBe(1);
    expect(right.width).toBe(3);
  });
});
