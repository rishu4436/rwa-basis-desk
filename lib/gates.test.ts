import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  constantProductBuyUsd,
  distanceLine,
  lastClearedSession,
  percentileBar,
  sessionsThatCleared,
} from "./gates";

describe("distance to a Prefer", () => {
  it("says how far a wide gap is from the percentile bar", () => {
    const line = distanceLine({
      spreadBps: 24.1,
      days: 31,
      percentile: 35,
      maxBps: 84.4,
      barBps: 44.6,
    });
    assert.match(line ?? "", /24\.1 bps under the liquid book/);
    assert.match(line ?? "", /21 bps short of the 45 bps bar/);
  });

  it("says a high percentile is short of the 15 bps band", () => {
    const line = distanceLine({
      spreadBps: 10.2,
      days: 31,
      percentile: 94,
      maxBps: 33.9,
      barBps: 20,
    });
    assert.match(line ?? "", /94th percentile/);
    assert.match(line ?? "", /4\.8 bps short of the 15 bps band/);
  });

  it("says a window cannot Prefer when the high is under 15 bps", () => {
    const line = distanceLine({
      spreadBps: 8.4,
      days: 31,
      percentile: 87,
      maxBps: 9.6,
      barBps: 8,
    });
    assert.match(line ?? "", /31-day high is 9\.6/);
    assert.match(line ?? "", /cannot Prefer/);
  });

  it("pins the latest day that cleared both price gates", () => {
    const points = [
      { date: "2026-08-30", bps: 84.4, buyClose: 1, avoidClose: 1 },
      { date: "2026-09-07", bps: 51.5, buyClose: 1, avoidClose: 1 },
      { date: "2026-09-29", bps: 24.1, buyClose: 1, avoidClose: 1 },
    ];
    const hit = lastClearedSession(points, 44.6);
    assert.equal(hit?.date, "2026-09-07");
    assert.deepEqual(
      sessionsThatCleared(points, 44.6).map((row) => row.date),
      ["2026-08-30", "2026-09-07"],
    );
    assert.equal(percentileBar([10, 20, 30, 40, 50, 60], 90), 60);
  });

  it("returns zero when the pool spot is already at the target", () => {
    assert.equal(constantProductBuyUsd(100, 10_000, 90), 0);
  });

  it("sizes a constant-product buy that stays under the target", () => {
    const paid = constantProductBuyUsd(1_000, 100_000, 110);
    assert.ok(paid != null && paid > 0);
  });
});
