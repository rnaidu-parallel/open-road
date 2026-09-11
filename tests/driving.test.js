import test from "node:test";
import assert from "node:assert/strict";
import { createDrivingState, stepDriving, LANE_LIMIT } from "../src/driving.js";

function run(state, keys, wetness, seconds, hz = 120) {
  for (let i = 0; i < seconds * hz; i++)
    stepDriving(state, new Set(keys), wetness, 1 / hz);
  return state;
}
test("held steering cannot move the car beyond the roadside boundary", () => {
  for (const side of ["a", "d"]) {
    const s = run(createDrivingState(), ["w", side], 1, 90);
    assert.ok(Math.abs(s.offset) <= LANE_LIMIT);
    assert.ok(s.speed > 0);
    assert.equal(s.lateralSpeed, 0);
  }
});
test("S brakes to a stop before engaging reverse, and W brakes before forward", () => {
  const s = { ...createDrivingState(), speed: 30, gear: 3, rpm: 5600 };
  while (s.speed > 0) stepDriving(s, new Set(["s"]), 0, 1 / 120);
  assert.equal(s.reverse, false);
  const progress = s.progress;
  run(s, ["s"], 0, 2);
  assert.equal(s.reverse, true);
  assert.ok(s.speed > 0 && s.progress < progress);
  while (s.speed > 0) stepDriving(s, new Set(["w"]), 0, 1 / 120);
  assert.equal(s.reverse, true);
  run(s, ["w"], 0, 1);
  assert.equal(s.reverse, false);
  assert.ok(s.speed > 0);
});
test("reverse from rest is capped at 25 km/h and coasts to a stop", () => {
  const s = run(createDrivingState(), ["s"], 0, 8);
  assert.equal(s.reverse, true);
  assert.ok(s.progress < 0);
  assert.ok(s.speed <= 25 / 3.6);
  run(s, [], 0, 20);
  assert.equal(s.speed, 0);
});
test("wet road requires a longer stopping distance at the same speed", () => {
  const stop = (wetness) => {
    const s = { ...createDrivingState(), speed: 30, gear: 3, rpm: 5600 };
    while (s.speed > 0) stepDriving(s, new Set(["s"]), wetness, 1 / 120);
    return s.distance;
  };
  assert.ok(stop(1) > stop(0) * 1.3);
});
test("driving is consistent across different frame rates", () => {
  const low = run(createDrivingState(), ["w"], 0.5, 20, 30),
    high = run(createDrivingState(), ["w"], 0.5, 20, 120);
  assert.ok(Math.abs(low.speed - high.speed) < 0.12);
  assert.ok(Math.abs(low.distance - high.distance) < 2);
});
test("zero throttle at rest stays at rest, and releasing steering damps it", () => {
  const s = run(createDrivingState(), [], 0, 10);
  assert.equal(s.speed, 0);
  assert.equal(s.distance, 0);
  run(s, ["w", "a"], 0, 3);
  run(s, [], 0, 3);
  assert.ok(Math.abs(s.lateralSpeed) < 0.01);
});

test("elapsed time is not discarded during low frame rates", async () => {
  const { advanceDriving } = await import("../src/driving.js");
  const low = createDrivingState(),
    high = createDrivingState();
  for (let i = 0; i < 100; i++) advanceDriving(low, new Set(["w"]), 0, 0.1);
  for (let i = 0; i < 1200; i++)
    advanceDriving(high, new Set(["w"]), 0, 1 / 120);
  assert.ok(Math.abs(low.distance - high.distance) < 0.05);
  assert.ok(Math.abs(low.speed - high.speed) < 0.01);
});
