import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvMat, CvModule } from "../opencv-types";
import { runGrayscale } from "./grayscale";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

function fakeMat(cols: number, rows: number): CvMat & { deleted: boolean } {
  const mat = {
    data: new Uint8Array(cols * rows * 4),
    cols,
    rows,
    deleted: false,
    delete() {
      mat.deleted = true;
    },
  };
  return mat;
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runGrayscale", () => {
  it("converts RGBA to gray and back to RGBA, in that order", () => {
    const src = fakeMat(2, 2);
    const gray = fakeMat(2, 2);
    const rgba = fakeMat(2, 2);
    const matQueue = [gray, rgba];
    const cvtColor = vi.fn();
    const cv: CvModule = {
      Mat: vi.fn(function () {
        return matQueue.shift() as CvMat;
      }) as unknown as CvModule["Mat"],
      matFromImageData: vi.fn(() => src),
      cvtColor,
      exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
      COLOR_RGBA2GRAY: 11,
      COLOR_GRAY2RGBA: 12,
    };

    const result = runGrayscale(cv, { imageData: new FakeImageData(new Uint8ClampedArray(16), 2, 2) as unknown as ImageData });

    expect(cvtColor).toHaveBeenNthCalledWith(1, src, gray, cv.COLOR_RGBA2GRAY);
    expect(cvtColor).toHaveBeenNthCalledWith(2, gray, rgba, cv.COLOR_GRAY2RGBA);
    expect(result.imageData.width).toBe(2);
    expect(result.imageData.height).toBe(2);
  });

  it("deletes every Mat it creates, even when cvtColor throws", () => {
    const src = fakeMat(1, 1);
    const gray = fakeMat(1, 1);
    const rgba = fakeMat(1, 1);
    const matQueue = [gray, rgba];
    const cv: CvModule = {
      Mat: vi.fn(function () {
        return matQueue.shift() as CvMat;
      }) as unknown as CvModule["Mat"],
      matFromImageData: vi.fn(() => src),
      cvtColor: vi.fn(() => {
        throw new Error("boom");
      }),
      exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
      COLOR_RGBA2GRAY: 11,
      COLOR_GRAY2RGBA: 12,
    };

    expect(() =>
      runGrayscale(cv, { imageData: new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData }),
    ).toThrow("boom");

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(rgba.deleted).toBe(true);
  });
});
