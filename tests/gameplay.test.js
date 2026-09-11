import test from "node:test";
import assert from "node:assert/strict";
import {
  createDrivingState,
  stepDriving,
  stepPowertrain,
  advanceDriving,
  ROAD_HALF_WIDTH,
  DRIVE_HALF_WIDTH,
} from "../src/driving.js";
import { stepTyres } from "../src/tyres.js";

const empty = new Set();
test("highway steering retains useful tyre force instead of fading with speed", () => {
  for (const kmh of [100, 160, 220, 300]) {
    const state = { ...createDrivingState(), speed: kmh / 3.6, steer: 1 };
    for (let i = 0; i < 600; i++) stepTyres(state, 1 / 120, 1);
    const lateral = state.speed * state.yawRate;
    assert.ok(lateral > 5.5 && lateral < 9.81, `${kmh} km/h: ${lateral}`);
  }
});

test("X alone produces a clear acceleration advantage over normal throttle", () => {
  const normal = createDrivingState(),
    boosted = createDrivingState();
  for (let i = 0; i < 120 * 10; i++) {
    stepPowertrain(normal, new Set(["w"]), 0, 1 / 120);
    stepPowertrain(boosted, new Set(["x"]), 0, 1 / 120);
  }
  assert.ok(boosted.speed > normal.speed * 1.4);
  assert.ok(boosted.boost > 0.9);
});

test("shoulders permit recovery without abruptly killing forward speed", () => {
  const state = {
    ...createDrivingState(),
    speed: 30,
    offset: 3.6,
    throttle: 1,
    gear: 3,
    rpm: 5600,
  };
  advanceDriving(state, new Set(["w"]), 0, 0.5);
  assert.ok(state.offset + 1.03 > ROAD_HALF_WIDTH);
  assert.ok(state.offset + 1.03 < DRIVE_HALF_WIDTH);
  assert.ok(state.shoulder > 0 && !state.edgeContact);
  assert.ok(state.speed > 28);
  advanceDriving(state, new Set(["a"]), 0, 0.3);
  assert.ok(state.offset < 3.6);
});

test("autopilot follows long routes through wet and dry curves", () => {
  for (const wetness of [0, 1]) {
    const state = { ...createDrivingState(), autopilot: true };
    let edgeContacts = 0,
      maxShoulder = 0;
    for (let i = 0; i < 120 * 400; i++) {
      stepDriving(state, empty, wetness, 1 / 120);
      edgeContacts += Number(state.edgeContact);
      maxShoulder = Math.max(maxShoulder, state.shoulder);
    }
    assert.ok(state.progress > 12500);
    assert.equal(edgeContacts, 0);
    assert.ok(maxShoulder < 0.2);
    assert.ok(state.autopilot);
  }
});

test("driving input takes over from autopilot on the next physics step", () => {
  for (const key of ["w", "a", "s", "d", "space", "x"]) {
    const state = { ...createDrivingState(), autopilot: true, speed: 30 };
    stepDriving(state, new Set([key]), 0, 1 / 120);
    assert.equal(state.autopilot, false);
  }
});
