import { describe, expect, it } from "vitest";
import { findGutterLine } from "./gutter";
import type { Corners } from "./geometry";

const BRIGHT: [number, number, number] = [240, 240, 240];
const DARK: [number, number, number] = [20, 20, 20];

function makeImageData(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data } as unknown as ImageData;
}

function fullFrameCorners(width: number, height: number): Corners {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: width, y: 0 },
    bottomRight: { x: width, y: height },
    bottomLeft: { x: 0, y: height },
  };
}

/**
 * gutter.ts内部のバンド分割(上下20%をinsetした範囲を5個の帯に分ける)をテスト側で再現したもの。
 * バンドごとに異なる暗部を配置するテストで、findGutterLineが実際に見る範囲・帯の境目と
 * 正確に一致させるために必要(単純にheight/5で割ると内部のinset分だけずれてしまう)。
 */
function insetBandRanges(height: number, numBands = 5, insetRatio = 0.2): Array<[number, number]> {
  const top = Math.round(height * insetRatio);
  const bottom = Math.round(height * (1 - insetRatio));
  const bounds: Array<[number, number]> = [];
  let cursor = top;
  for (let i = 0; i < numBands; i++) {
    const remaining = numBands - i;
    const size = Math.round((bottom - cursor) / remaining);
    const next = cursor + size;
    bounds.push([cursor, next]);
    cursor = next;
  }
  return bounds;
}

describe("findGutterLine", () => {
  it("finds a dark vertical band near the center of a bright spread photo", () => {
    const width = 200;
    const height = 150;
    const gutterX = 120;
    const imageData = makeImageData(width, height, (x) =>
      Math.abs(x - gutterX) <= 2 ? DARK : BRIGHT,
    );

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.topX).toBeLessThanOrEqual(gutterX + 4);
    expect(result.bottomX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.bottomX).toBeLessThanOrEqual(gutterX + 4);
  });

  it("ignores a decoy dark band outside the central search window", () => {
    const width = 200;
    const height = 150;
    const decoyX = 20; // outside the center 40% window ([60,140] for this bounding box)
    const gutterX = 100;
    const imageData = makeImageData(width, height, (x) => {
      if (Math.abs(x - decoyX) <= 2) return DARK;
      if (Math.abs(x - gutterX) <= 2) return DARK;
      return BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.topX).toBeLessThanOrEqual(gutterX + 4);
    expect(result.bottomX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.bottomX).toBeLessThanOrEqual(gutterX + 4);
  });

  it("falls back to the bounding box's horizontal center when there is no clear valley", () => {
    const width = 200;
    const height = 150;
    const imageData = makeImageData(width, height, () => BRIGHT);

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result).toEqual({ topX: 100, bottomX: 100 });
  });

  it("restricts the search to the vertical/horizontal range of the detected corners, not the full frame", () => {
    // A spread quad that only occupies the left 2/3 of a wider photo, with background
    // (unrelated dark content) filling the rest of the frame to the right.
    const width = 300;
    const height = 150;
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 200, y: 0 },
      bottomRight: { x: 200, y: height },
      bottomLeft: { x: 0, y: height },
    };
    const trueGutterX = 100; // center of the quad's own bounding box
    const imageData = makeImageData(width, height, (x) => {
      if (x >= 220) return DARK; // unrelated dark region outside the quad, should be ignored
      if (Math.abs(x - trueGutterX) <= 2) return DARK;
      return BRIGHT;
    });

    const result = findGutterLine(imageData, corners);

    expect(result.topX).toBeGreaterThanOrEqual(trueGutterX - 4);
    expect(result.topX).toBeLessThanOrEqual(trueGutterX + 4);
    expect(result.bottomX).toBeGreaterThanOrEqual(trueGutterX - 4);
    expect(result.bottomX).toBeLessThanOrEqual(trueGutterX + 4);
  });

  it("ignores a decoy edge that is only visible in part of the frame's height", () => {
    // Simulates an unrelated object (e.g. a table edge) that is only visible near the
    // bottom of the frame, unlike the true gutter shadow which runs the full height.
    const width = 200;
    const height = 150;
    const gutterX = 110;
    const decoyX = 70;
    const decoyOnlyBelowY = 102; // confined to roughly the last of 5 vertical bands

    const imageData = makeImageData(width, height, (x, y) => {
      if (Math.abs(x - gutterX) <= 2) return DARK;
      if (y >= decoyOnlyBelowY && Math.abs(x - decoyX) <= 2) return DARK;
      return BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.topX).toBeLessThanOrEqual(gutterX + 4);
    expect(result.bottomX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.bottomX).toBeLessThanOrEqual(gutterX + 4);
  });

  it("rejects a full-height silhouette edge that never recovers brightness on one side, in favor of a genuine valley", () => {
    // Simulates a rectangular object (e.g. a table) filling the left part of the search
    // window: dark from the window's left edge up to x=94, never brightening again before
    // that point, so it's a step/silhouette rather than a valley. The old algorithm would
    // pick a column inside this dark region (it's the darkest), reproducing the reported bug.
    const width = 200;
    const height = 150;
    const gutterX = 115;

    const imageData = makeImageData(width, height, (x) => {
      if (x <= 94) return DARK; // object silhouette, dark all the way to the window's left edge
      if (Math.abs(x - gutterX) <= 2) return DARK; // genuine gutter valley, bright on both sides
      return BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.topX).toBeLessThanOrEqual(gutterX + 4);
    expect(result.bottomX).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result.bottomX).toBeLessThanOrEqual(gutterX + 4);
  });

  it("falls back to the bounding box's center when bands disagree on where the dark region is", () => {
    // Each band sees its own isolated dark dip at a different, non-monotonic x position, so
    // each individually passes the depth/shape gate, but they don't lie on any single line -
    // there is no consistent (even if slanted) gutter to agree on.
    const width = 200;
    const height = 150;
    const ranges = insetBandRanges(height);
    const dipXsByBand = [130, 65, 120, 70]; // bands 0-3 zigzag; band 4 stays bright

    const imageData = makeImageData(width, height, (x, y) => {
      const band = ranges.findIndex(([from, to]) => y >= from && y < to);
      const dipX = band >= 0 ? dipXsByBand[band] : undefined;
      if (dipX !== undefined && Math.abs(x - dipX) <= 2) return DARK;
      return BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result).toEqual({ topX: 100, bottomX: 100 });
  });

  it("tolerates small band-to-band jitter in the true gutter's position", () => {
    // A slightly skewed spread photo can shift the gutter's x position by a few pixels
    // from band to band; the agreement tolerance should still recognize these as the same gutter.
    const width = 200;
    const height = 150;
    const ranges = insetBandRanges(height);
    const gutterXsByBand = [98, 100, 102, 100, 99];

    const imageData = makeImageData(width, height, (x, y) => {
      const band = ranges.findIndex(([from, to]) => y >= from && y < to);
      const gutterX = band >= 0 ? gutterXsByBand[band] : gutterXsByBand[gutterXsByBand.length - 1];
      return Math.abs(x - gutterX) <= 2 ? DARK : BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(96);
    expect(result.topX).toBeLessThanOrEqual(104);
    expect(result.bottomX).toBeGreaterThanOrEqual(96);
    expect(result.bottomX).toBeLessThanOrEqual(104);
  });

  it("detects a slanted gutter line when the book is rotated in the photo", () => {
    // A photographed book that's rotated relative to the camera makes the gutter's
    // shadow shift x position linearly from the top of the frame to the bottom -
    // this is the real-world scenario that caused content to be lost/misassigned
    // when the split assumed a single vertical column. topTrueX/bottomTrueX are the
    // expected values at the search range's own top/bottom (20%-inset from the frame edges),
    // which is what findGutterLine actually reports against.
    const width = 200;
    const height = 150;
    const insetTop = Math.round(height * 0.2);
    const insetBottom = Math.round(height * 0.8);
    const topTrueX = 90;
    const bottomTrueX = 130;
    const gutterAtY = (y: number) =>
      topTrueX + ((bottomTrueX - topTrueX) * (y - insetTop)) / (insetBottom - insetTop);

    const imageData = makeImageData(width, height, (x, y) => {
      const gx = gutterAtY(y);
      return Math.abs(x - gx) <= 2 ? DARK : BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(topTrueX - 6);
    expect(result.topX).toBeLessThanOrEqual(topTrueX + 6);
    expect(result.bottomX).toBeGreaterThanOrEqual(bottomTrueX - 6);
    expect(result.bottomX).toBeLessThanOrEqual(bottomTrueX + 6);
    expect(result.bottomX).toBeGreaterThan(result.topX);
  });

  it("prefers a wide gradual valley (a real gutter shadow) over a narrow sharp one (a printed rule line)", () => {
    // Real photos of books with diagrams/tables printed close to the inner margin (e.g. a
    // shogi puzzle book) can have a printed border line that is just as deep and just as
    // well-recovered on both sides as the true gutter shadow, but is only a few pixels wide -
    // unlike the gutter's shadow, which is physically a soft, wide gradient. Depth and
    // two-sided recovery alone can't tell these apart; only width can.
    const width = 2000;
    const height = 1500;
    const trueGutterX = 1000;
    const trueGutterRadius = 40; // wide, gradual ramp -> ~5% of the search window's width
    const decoyLineX = 700; // narrow, sharp -> well under 1% of the search window's width

    const imageData = makeImageData(width, height, (x) => {
      const distance = Math.abs(x - trueGutterX);
      if (distance <= trueGutterRadius) {
        const t = distance / trueGutterRadius;
        const value = Math.round(20 + t * (240 - 20));
        return [value, value, value];
      }
      if (Math.abs(x - decoyLineX) <= 1) return DARK;
      return BRIGHT;
    });

    const result = findGutterLine(imageData, fullFrameCorners(width, height));

    expect(result.topX).toBeGreaterThanOrEqual(trueGutterX - 10);
    expect(result.topX).toBeLessThanOrEqual(trueGutterX + 10);
    expect(result.bottomX).toBeGreaterThanOrEqual(trueGutterX - 10);
    expect(result.bottomX).toBeLessThanOrEqual(trueGutterX + 10);
  });
});
