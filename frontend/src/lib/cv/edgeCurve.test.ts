import { describe, expect, it } from "vitest";
import {
  buildRuledSurfaceMap,
  clampCurveMagnitude,
  evaluateCurve,
  fitEdgeCurve,
  isCurveSignificant,
  type QuadraticCurve,
} from "./edgeCurve";
import type { Point } from "./geometry";

describe("fitEdgeCurve", () => {
  it("recovers a known bow (a) from noiseless points along an axis-aligned chord, always passing through start/end", () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 100, y: 0 };
    const a = 0.002; // v(u) = a*u*(u-100): v(0)=0, v(100)=0, dips to -5 at the midpoint

    const points: Point[] = [];
    for (let u = 0; u <= 100; u += 5) {
      points.push({ x: u, y: a * u * (u - 100) });
    }

    const fit = fitEdgeCurve(points, start, end);

    expect(fit.a).toBeCloseTo(a, 5);
    expect(fit.b).toBeCloseTo(-a * 100, 3);
    expect(fit.c).toBe(0);
    expect(fit.pointCount).toBe(points.length);
    expect(fit.rmsResidual).toBeCloseTo(0, 5);
    // 制約により、フィット曲線は常にstart/endそのものを通る。
    expect(evaluateCurve(fit, 0)).toEqual(start);
    expect(evaluateCurve(fit, 1)).toEqual(end);
  });

  it("recovers a known bow along a rotated (non-axis-aligned) chord", () => {
    const start: Point = { x: 10, y: 20 };
    const end: Point = { x: 110, y: 40 };
    const trueCurve: QuadraticCurve = {
      origin: start,
      axis: { x: 100 / Math.hypot(100, 20), y: 20 / Math.hypot(100, 20) },
      a: 0.003,
      b: -0.003 * Math.hypot(100, 20),
      c: 0,
      start,
      end,
      pointCount: 0,
      rmsResidual: 0,
    };

    const points: Point[] = [];
    for (let i = 0; i <= 20; i++) {
      points.push(evaluateCurve(trueCurve, i / 20));
    }

    const fit = fitEdgeCurve(points, start, end);

    expect(fit.a).toBeCloseTo(trueCurve.a, 5);
    expect(fit.b).toBeCloseTo(trueCurve.b, 3);
    expect(fit.c).toBe(0);
    expect(fit.rmsResidual).toBeCloseTo(0, 5);
  });

  it("always passes through start/end even when the raw contour points are noisy (real-photo regression guard)", () => {
    // 実写真での回帰: 指の写り込み等で下辺の輪郭点にノイズが乗ると、制約の無い自由フィットでは
    // 曲線の両端が実際の頂点(信頼済みのstart/end)から30px以上ずれ、見開き分割時に隣ページを
    // 巻き込む原因になっていた。制約付きフィットならノイズの内容によらず必ずstart/endを通る。
    const start: Point = { x: 0, y: 2776 };
    const end: Point = { x: 1956, y: 2704 };
    const noisyPoints: Point[] = [
      { x: 0, y: 2776 },
      { x: 300, y: 2760 },
      { x: 600, y: 2900 }, // 指の写り込み等による外れ値
      { x: 900, y: 2740 },
      { x: 1200, y: 2950 }, // 外れ値
      { x: 1500, y: 2730 },
      { x: 1956, y: 2704 },
    ];

    const fit = fitEdgeCurve(noisyPoints, start, end);

    // t=0はu=0となりv=c=0が代数的に厳密に成り立つため常に正確にstartと一致するが、
    // t=1は弦長が割り切れない値になりうるため浮動小数点の丸め誤差を許容する。
    expect(evaluateCurve(fit, 0)).toEqual(start);
    const atEnd = evaluateCurve(fit, 1);
    expect(atEnd.x).toBeCloseTo(end.x, 6);
    expect(atEnd.y).toBeCloseTo(end.y, 6);
  });

  it("falls back to a flat (a=b=c=0) curve when fewer than 2 points are given", () => {
    const fit = fitEdgeCurve([{ x: 0, y: 0 }], { x: 0, y: 0 }, { x: 10, y: 0 });

    expect(fit).toMatchObject({ a: 0, b: 0, c: 0, pointCount: 1 });
  });

  it("computes a large rmsResidual when the points are scattered noise rather than a clean curve", () => {
    // 木目調の背景・手など実写真のノイズ混入を模した、綴じ目のカーブとは無関係にばらついた点群。
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 200, y: 0 };
    const noisyPoints: Point[] = [
      { x: 0, y: 0 },
      { x: 25, y: 40 },
      { x: 50, y: -35 },
      { x: 75, y: 30 },
      { x: 100, y: -45 },
      { x: 125, y: 25 },
      { x: 150, y: -30 },
      { x: 175, y: 35 },
      { x: 200, y: 0 },
    ];

    const fit = fitEdgeCurve(noisyPoints, start, end);

    expect(fit.rmsResidual).toBeGreaterThan(10);
  });
});

describe("evaluateCurve", () => {
  it("evaluates a flat curve (a=b=c=0) as points along the straight chord", () => {
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 0,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      pointCount: 10,
      rmsResidual: 0,
    };

    expect(evaluateCurve(curve, 0)).toEqual({ x: 0, y: 0 });
    expect(evaluateCurve(curve, 0.5)).toEqual({ x: 50, y: 0 });
    expect(evaluateCurve(curve, 1)).toEqual({ x: 100, y: 0 });
  });

  it("offsets perpendicular to the chord axis according to c", () => {
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 10,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      pointCount: 10,
      rmsResidual: 0,
    };

    expect(evaluateCurve(curve, 0)).toEqual({ x: 0, y: 10 });
    expect(evaluateCurve(curve, 1)).toEqual({ x: 100, y: 10 });
  });
});

describe("isCurveSignificant", () => {
  it("returns false for a curve with negligible deviation from the chord", () => {
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 1,
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      pointCount: 10,
      rmsResidual: 0,
    };

    expect(isCurveSignificant(curve)).toBe(false);
  });

  it("returns true for a well-fit curve (many points, low residual) with a large deviation from the chord", () => {
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 20,
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      pointCount: 10,
      rmsResidual: 0.5,
    };

    expect(isCurveSignificant(curve)).toBe(true);
  });

  it("checks the interior vertex of the parabola, not just the endpoints", () => {
    // b chosen so the vertex (u = -b/2a) sits at the chord midpoint (u=100), where the
    // curve peaks even though both endpoints (u=0, u=200) evaluate to c=0.
    const chordLength = 200;
    const a = 0.01;
    const b = -a * chordLength;
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a,
      b,
      c: 0,
      start: { x: 0, y: 0 },
      end: { x: chordLength, y: 0 },
      pointCount: 10,
      rmsResidual: 0.5,
    };

    expect(isCurveSignificant(curve)).toBe(true);
  });

  it("returns false when fewer points than MIN_POINTS_FOR_RELIABLE_FIT were used, even with a large deviation", () => {
    // 実写真での回帰: 少数点(例:3点)への二次フィットは必ず残差0で「綺麗に」見えてしまうため、
    // 点数不足そのものを別途チェックしないと湾曲補正が暴走しうる。
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 30,
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      pointCount: 3,
      rmsResidual: 0,
    };

    expect(isCurveSignificant(curve)).toBe(false);
  });

  it("returns false when the deviation is not clearly distinguishable from the fit's residual noise", () => {
    // 変形量(20)がRMS残差(15)の3倍未満のため、実際の湾曲かノイズへの過剰適合か区別できない。
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 20,
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      pointCount: 10,
      rmsResidual: 15,
    };

    expect(isCurveSignificant(curve)).toBe(false);
  });
});

describe("clampCurveMagnitude", () => {
  it("leaves a curve within the allowed deviation ratio unchanged", () => {
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 5, // 5px deviation over a 200px chord = 2.5%, within the default 6% cap
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      pointCount: 10,
      rmsResidual: 0.5,
    };

    expect(clampCurveMagnitude(curve)).toEqual(curve);
  });

  it("scales down a,b,c proportionally when the deviation exceeds the allowed ratio", () => {
    const chordLength = 200;
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 40, // 40px over 200px = 20% deviation, well above the default 6% cap
      start: { x: 0, y: 0 },
      end: { x: chordLength, y: 0 },
      pointCount: 10,
      rmsResidual: 0.5,
    };

    const clamped = clampCurveMagnitude(curve);

    // 6% of 200px = 12px
    expect(clamped.c).toBeCloseTo(12, 5);
    expect(clamped.a).toBe(0);
    expect(clamped.b).toBe(0);
  });

  it("preserves the shape (location of the peak) while reducing magnitude", () => {
    const chordLength = 200;
    const a = 0.02; // large enough that the vertex-based peak deviation exceeds the cap
    const b = -a * chordLength; // vertex at the chord midpoint
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a,
      b,
      c: 0,
      start: { x: 0, y: 0 },
      end: { x: chordLength, y: 0 },
      pointCount: 10,
      rmsResidual: 0.5,
    };

    const clamped = clampCurveMagnitude(curve);

    // スケールは a,b,c 全てに同じ係数がかかるため、b/a の比(≒頂点位置)は変わらない。
    expect(clamped.b / clamped.a).toBeCloseTo(b / a, 5);
  });

  it("respects a custom maxDeviationRatio", () => {
    const curve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 40,
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      pointCount: 10,
      rmsResidual: 0.5,
    };

    expect(clampCurveMagnitude(curve, 0.1).c).toBeCloseTo(20, 5);
  });
});

describe("buildRuledSurfaceMap", () => {
  it("produces an identity map when both curves are flat and axis-aligned with the output rect", () => {
    const topCurve: QuadraticCurve = {
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 0,
      start: { x: 0, y: 0 },
      end: { x: 9, y: 0 },
      pointCount: 10,
      rmsResidual: 0,
    };
    const bottomCurve: QuadraticCurve = {
      origin: { x: 0, y: 9 },
      axis: { x: 1, y: 0 },
      a: 0,
      b: 0,
      c: 0,
      start: { x: 0, y: 9 },
      end: { x: 9, y: 9 },
      pointCount: 10,
      rmsResidual: 0,
    };

    const { mapX, mapY } = buildRuledSurfaceMap(topCurve, bottomCurve, 10, 10);

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        expect(mapX[y * 10 + x]).toBeCloseTo(x, 5);
        expect(mapY[y * 10 + x]).toBeCloseTo(y, 5);
      }
    }
  });
});
