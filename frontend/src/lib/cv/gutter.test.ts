import { describe, expect, it } from "vitest";
import { findGutterX } from "./gutter";
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

describe("findGutterX", () => {
  it("finds a dark vertical band near the center of a bright spread photo", () => {
    const width = 200;
    const height = 150;
    const gutterX = 120;
    const imageData = makeImageData(width, height, (x) =>
      Math.abs(x - gutterX) <= 2 ? DARK : BRIGHT,
    );

    const result = findGutterX(imageData, fullFrameCorners(width, height));

    expect(result).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result).toBeLessThanOrEqual(gutterX + 4);
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

    const result = findGutterX(imageData, fullFrameCorners(width, height));

    expect(result).toBeGreaterThanOrEqual(gutterX - 4);
    expect(result).toBeLessThanOrEqual(gutterX + 4);
  });

  it("falls back to the bounding box's horizontal center when there is no clear valley", () => {
    const width = 200;
    const height = 150;
    const imageData = makeImageData(width, height, () => BRIGHT);

    const result = findGutterX(imageData, fullFrameCorners(width, height));

    expect(result).toBe(100);
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

    const result = findGutterX(imageData, corners);

    expect(result).toBeGreaterThanOrEqual(trueGutterX - 4);
    expect(result).toBeLessThanOrEqual(trueGutterX + 4);
  });
});
