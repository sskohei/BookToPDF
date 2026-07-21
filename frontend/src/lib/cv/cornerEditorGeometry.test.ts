import { describe, expect, it } from "vitest";
import {
  clampPointToBounds,
  defaultCorners,
  displayPointToImagePoint,
  imagePointToDisplayPoint,
  imageToDisplayScale,
} from "./cornerEditorGeometry";

describe("imageToDisplayScale", () => {
  it("computes the ratio between rendered width and the image's natural width", () => {
    expect(imageToDisplayScale({ width: 1000, height: 2000 }, 250)).toBe(0.25);
  });

  it("returns 1 when the natural width is 0 to avoid division by zero", () => {
    expect(imageToDisplayScale({ width: 0, height: 0 }, 250)).toBe(1);
  });
});

describe("imagePointToDisplayPoint / displayPointToImagePoint", () => {
  it("scales a point from image space to display space", () => {
    expect(imagePointToDisplayPoint({ x: 400, y: 800 }, 0.25)).toEqual({ x: 100, y: 200 });
  });

  it("scales a point from display space back to image space", () => {
    expect(displayPointToImagePoint({ x: 100, y: 200 }, 0.25)).toEqual({ x: 400, y: 800 });
  });

  it("returns the origin when scale is 0 instead of dividing by zero", () => {
    expect(displayPointToImagePoint({ x: 100, y: 200 }, 0)).toEqual({ x: 0, y: 0 });
  });

  it("round-trips image -> display -> image", () => {
    const point = { x: 137, y: 542 };
    const scale = 0.37;
    const roundTripped = displayPointToImagePoint(imagePointToDisplayPoint(point, scale), scale);
    expect(roundTripped.x).toBeCloseTo(point.x, 5);
    expect(roundTripped.y).toBeCloseTo(point.y, 5);
  });
});

describe("clampPointToBounds", () => {
  const bounds = { width: 100, height: 200 };

  it("leaves an interior point unchanged", () => {
    expect(clampPointToBounds({ x: 50, y: 50 }, bounds)).toEqual({ x: 50, y: 50 });
  });

  it("clamps negative x/y to 0", () => {
    expect(clampPointToBounds({ x: -10, y: -5 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  it("clamps points beyond the bounds to width/height", () => {
    expect(clampPointToBounds({ x: 150, y: 250 }, bounds)).toEqual({ x: 100, y: 200 });
  });

  it("leaves a boundary point unchanged", () => {
    expect(clampPointToBounds({ x: 100, y: 200 }, bounds)).toEqual({ x: 100, y: 200 });
  });
});

describe("defaultCorners", () => {
  it("returns a rectangle inset by the default ratio (5%) from each edge", () => {
    const result = defaultCorners({ width: 1000, height: 2000 });

    expect(result).toEqual({
      topLeft: { x: 50, y: 100 },
      topRight: { x: 950, y: 100 },
      bottomRight: { x: 950, y: 1900 },
      bottomLeft: { x: 50, y: 1900 },
    });
  });

  it("supports a custom inset ratio", () => {
    const result = defaultCorners({ width: 100, height: 100 }, 0.1);

    expect(result).toEqual({
      topLeft: { x: 10, y: 10 },
      topRight: { x: 90, y: 10 },
      bottomRight: { x: 90, y: 90 },
      bottomLeft: { x: 10, y: 90 },
    });
  });

  it("works for a non-square (spread) image size", () => {
    const result = defaultCorners({ width: 2000, height: 1000 }, 0.05);

    expect(result).toEqual({
      topLeft: { x: 100, y: 50 },
      topRight: { x: 1900, y: 50 },
      bottomRight: { x: 1900, y: 950 },
      bottomLeft: { x: 100, y: 950 },
    });
  });
});
