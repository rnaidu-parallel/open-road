import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { followCamera } from "../src/camera.js";
import { createWeatherState, updateWeather } from "../src/weather-state.js";
import {
  createDrivingState,
  advanceDriving,
  LANE_LIMIT,
  DRIVE_HALF_WIDTH,
} from "../src/driving.js";
import { roadCenter, roadTangent, roadCurvature } from "../src/road.js";
import { sceneryFootprint, safeSceneryOffset } from "../src/placement.js";
test("chase camera stays exactly behind the car across all turn angles", () => {
  const camera = new THREE.PerspectiveCamera(),
    car = new THREE.Group();
  for (let yaw = -1.5; yaw < 1.5; yaw += 0.025) {
    car.position.set(Math.sin(yaw) * 90, 0, 0);
    car.rotation.y = yaw;
    followCamera(camera, car, 0);
    const relative = camera.position
      .clone()
      .sub(car.position)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
    assert.ok(Math.abs(relative.x) < 1e-10);
    assert.ok(Math.abs(relative.z - 7.1) < 1e-10);
  }
});
test("rain builds clouds first and fades gradually when switched off", () => {
  const w = createWeatherState();
  updateWeather(w, true, 0, 1);
  assert.ok(w.cloud > 0);
  assert.equal(w.precipitation, 0);
  assert.equal(w.wetness, 0);
  for (let i = 0; i < 200; i++) updateWeather(w, true, 0, 0.1);
  assert.ok(w.precipitation > 0.8);
  assert.ok(w.wetness > 0.5);
  const previous = w.precipitation;
  updateWeather(w, false, 0, 0.1);
  assert.ok(w.precipitation < previous && w.precipitation > previous * 0.9);
});
test("snowfall does not create rainy-road wetness", () => {
  const w = createWeatherState();
  for (let i = 0; i < 300; i++) updateWeather(w, true, 1, 0.1);
  assert.ok(w.precipitation > 0.9);
  assert.equal(w.wetness, 0);
});
test("handbrake generates controllable slip and releases traction smoothly", () => {
  const s = createDrivingState();
  const gripped = createDrivingState();
  advanceDriving(gripped, new Set(["w"]), 0, 10);
  advanceDriving(gripped, new Set(["a"]), 0, 1.5);
  advanceDriving(s, new Set(["w"]), 0, 10);
  advanceDriving(s, new Set(["a", "space"]), 0, 1.5);
  assert.ok(s.handbrake && s.rearGrip < 0.4);
  assert.ok(Math.abs(s.driftAngle) > Math.abs(gripped.driftAngle) + 0.1);
  assert.ok(Math.abs(s.offset) <= LANE_LIMIT);
  advanceDriving(s, new Set(), 0, 4);
  assert.ok(!s.handbrake && s.driftAmount < 0.01);
});
test("route has true straights, smooth joins and bounded corner sharpness", () => {
  for (let s = 10; s < 270; s += 10) {
    assert.equal(roadCenter(s), 0);
    assert.equal(roadTangent(s), 0);
  }
  let maxCurve = 0;
  for (let s = 0; s < 7000; s += 0.5) {
    maxCurve = Math.max(maxCurve, Math.abs(roadCurvature(s)));
    assert.ok(Math.abs(roadCenter(s + 0.001) - roadCenter(s - 0.001)) < 0.003);
    assert.ok(Math.abs(roadTangent(s)) < 1);
  }
  assert.ok(maxCurve < 0.004 && maxCurve > 0.002);
});

test("complete boulder and bush bounds stay clear on straights and bends", async () => {
  for (let s = 0; s < 6500; s += 13)
    for (const radius of [0.2, 1, 4, 12])
      for (const side of [-1, 1]) {
        const x = roadCenter(s) + safeSceneryOffset(side * 4.5, radius);
        for (
          let along = -radius;
          along <= radius;
          along += Math.max(0.1, radius / 8)
        ) {
          const clearance = Math.abs(x - roadCenter(s + along)) - radius;
          assert.ok(clearance > DRIVE_HALF_WIDTH + 0.25);
        }
      }
});

test("leaning tree geometry clears the road even when the trunk is off-centre", () => {
  const geometry = new THREE.BufferGeometry();
  // One low trunk triangle leaning across the origin; a canopy safely above the car.
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-3, 0, 0, -2, 1, 1, -4, 4, 0, -10, 8, 0, 10, 8, 0, 0, 12, 0],
      3,
    ),
  );
  const radius = sceneryFootprint([{ geometry }], 3.5);
  assert.equal(radius, 4);
  for (let s = 0; s < 1900; s += 8)
    for (const side of [-1, 1]) {
      const offset = safeSceneryOffset(side * 6.5, Math.SQRT2 * radius);
      for (const along of [-radius, 0, radius])
        assert.ok(
          Math.abs(roadCenter(s) + offset - roadCenter(s + along)) -
            Math.SQRT2 * radius >
            4.05,
        );
    }
});

test("the rotated car body stays inside the roadside boundary while drifting", () => {
  const s = createDrivingState();
  s.speed = 30;
  s.progress = 330;
  for (let i = 0; i < 1400; i++) {
    advanceDriving(
      s,
      new Set(["w", i < 700 ? "a" : "d", "space"]),
      0.3,
      1 / 120,
    );
    const heading = s.heading + s.bodyYaw;
    for (const x of [-1.03, 1.03])
      for (const z of [-2.395, 2.395]) {
        const cornerX =
          roadCenter(s.progress) +
          s.offset +
          x * Math.cos(heading) +
          z * Math.sin(heading);
        const cornerS =
          s.progress + x * Math.sin(heading) - z * Math.cos(heading);
        assert.ok(Math.abs(cornerX - roadCenter(cornerS)) < DRIVE_HALF_WIDTH);
      }
  }
});
