import test from "node:test";
import assert from "node:assert/strict";
import {
  createDrivingState,
  stepPowertrain,
  advanceDriving,
} from "../src/driving.js";
import { stepTyres } from "../src/tyres.js";
import { engineMix } from "../src/engine-mix.js";
import { sampleElevation } from "../src/elevation.js";
import { readFileSync } from "node:fs";

function power(state, keys, seconds) {
  for (let i = 0; i < seconds * 120; i++)
    stepPowertrain(state, new Set(keys), 0, 1 / 120);
}

test("acceleration tapers and turbo reaches but cannot exceed 320 km/h", () => {
  const s = createDrivingState(),
    times = {};
  let lowAcceleration, highAcceleration;
  for (let i = 0; i < 100 * 120; i++) {
    stepPowertrain(s, new Set(["w", "x"]), 0, 1 / 120);
    for (const speed of [100, 200, 320])
      if (!times[speed] && s.speed * 3.6 >= speed - 0.001)
        times[speed] = i / 120;
    if (s.speed > 25 && s.speed < 26 && s.shiftTime === 0)
      lowAcceleration = s.acceleration;
    if (s.speed > 80 && s.speed < 81 && s.shiftTime === 0)
      highAcceleration = s.acceleration;
    assert.ok(s.speed * 3.6 <= 320.000001);
  }
  assert.ok(times[100] > 5 && times[100] < 10);
  assert.ok(times[320] > 35 && times[320] < 60);
  assert.ok(highAcceleration < lowAcceleration * 0.4);
});

test("lifting the throttle produces substantial gradual engine braking", () => {
  const s = {
    ...createDrivingState(),
    speed: 100 / 3.6,
    gear: 3,
    rpm: 5600,
    throttle: 1,
  };
  power(s, [], 8);
  assert.ok(s.speed * 3.6 > 55 && s.speed * 3.6 < 80);
  const mix = engineMix(s, 20);
  assert.ok(mix.overrun > 0.4 && mix.power > 0.1);
  assert.ok(mix.frequency > 3000);
});

test("turbo takes time to spool and releases when the throttle lifts", () => {
  const s = {
    ...createDrivingState(),
    speed: 35,
    gear: 4,
    rpm: 5400,
    throttle: 1,
  };
  power(s, ["w", "x"], 0.1);
  assert.ok(s.boost > 0 && s.boost < 0.2);
  power(s, ["w", "x"], 2);
  assert.ok(s.boost > 0.85);
  power(s, [], 1);
  assert.ok(s.boost < 0.04);
});

test("the road does not steer the vehicle when the player holds W", () => {
  const s = { ...createDrivingState(), progress: 720, speed: 22 };
  let touchedEdge = false;
  for (let i = 0; i < 360; i++) {
    advanceDriving(s, new Set(["w"]), 0, 1 / 120);
    touchedEdge ||= s.edgeContact;
  }
  assert.equal(s.heading, 0);
  assert.equal(s.yawRate, 0);
  assert.ok(touchedEdge);
  const start = s.heading;
  advanceDriving(s, new Set(["w", "d"]), 0, 0.7);
  assert.ok(s.heading < start - 0.01);
});

test("handbrake reduces rear grip, and countersteering reduces the yaw rate", () => {
  const s = { ...createDrivingState(), speed: 25, steer: 0.9, handbrake: true };
  for (let i = 0; i < 120; i++) stepTyres(s, 1 / 120, 1);
  assert.ok(s.rearGrip < 0.33 && s.driftAmount > 0.2);
  const yaw = s.yawRate;
  s.handbrake = false;
  s.steer = -0.7;
  for (let i = 0; i < 90; i++) stepTyres(s, 1 / 120, 1);
  assert.ok(s.rearGrip > 0.8);
  assert.ok(s.yawRate < yaw);
});

test("mountain elevation data is valid and joins without height jumps", () => {
  const bytes = readFileSync(
    new URL("../public/assets/mountain-height.bin", import.meta.url),
  );
  const values = new Uint16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.equal(values.length, 256 * 256);
  assert.ok(Math.max(...values) > 2000);
  for (const boundary of [0, 1, 2])
    assert.ok(
      Math.abs(
        sampleElevation(values, 256, boundary - 0.000001, 0.2) -
          sampleElevation(values, 256, boundary + 0.000001, 0.2),
      ) < 0.01,
    );
});

test("boost produces short exhaust pulses and pressure release when X lifts", () => {
  const s = {
    ...createDrivingState(),
    speed: 35,
    gear: 4,
    rpm: 5600,
    throttle: 1,
  };
  let burst = false;
  for (let i = 0; i < 480; i++) {
    stepPowertrain(s, new Set(["w", "x"]), 0, 1 / 120);
    burst ||= s.exhaust > 0.5;
  }
  assert.ok(burst);
  stepPowertrain(s, new Set(["w"]), 0, 1 / 120);
  assert.ok(s.blowoff > 0.8);
  assert.ok(s.exhaust > 0.5);
  power(s, ["w"], 1);
  assert.ok(s.exhaust < 0.001 && s.blowoff < 0.01);
  const idle = createDrivingState();
  power(idle, ["x"], 3);
  assert.equal(idle.exhaust, 0);
});
