import { updateBoostEffects } from "./boost-effects.js";
import { stepTyres } from "./tyres.js";
import { autopilotControl } from "./autopilot.js";
export const ROAD_HALF_WIDTH = 3.8;
export const SHOULDER_WIDTH = 1.6;
export const DRIVE_HALF_WIDTH = ROAD_HALF_WIDTH + SHOULDER_WIDTH;
export const CAR_HALF_WIDTH = 1.03;
export const LANE_LIMIT = DRIVE_HALF_WIDTH - CAR_HALF_WIDTH - 0.16;
import { roadCenter, roadTangent, roadCurvature } from "./road.js";
export { roadCenter, roadTangent, roadCurvature };
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const damp = (a, b, rate, dt) =>
  a + (b - a) * (1 - Math.exp(-rate * dt));
const RATIOS = [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69];
export const createDrivingState = () => ({
  distance: 0,
  progress: 0,
  speed: 0,
  offset: 1.75,
  lateralSpeed: 0,
  steer: 0,
  acceleration: 0,
  braking: false,
  throttle: 0,
  gear: 1,
  reverse: false,
  directionHold: 0,
  rpm: 850,
  shiftTime: 0,
  lateralG: 0,
  handbrake: false,
  driftAngle: 0,
  driftAmount: 0,
  bodyYaw: 0,
  heading: 0,
  yawRate: 0,
  boost: 0,
  turboInput: false,
  edgeContact: false,
  sideSpeed: 0,
  rearGrip: 1,
  steeringAngle: 0,
  shoulder: 0,
  autopilot: false,
});
export function stepPowertrain(state, keys, wetness, dt, control = null) {
  const forward =
      Boolean(control) ||
      keys.has("w") ||
      keys.has("arrowup") ||
      (keys.has("x") && !state.reverse),
    backward = keys.has("s") || keys.has("arrowdown");
  const opposite = state.reverse ? forward : backward;
  if (state.speed < 0.05 && opposite && forward !== backward) {
    state.directionHold += dt;
    if (state.directionHold >= 0.35) {
      state.reverse = !state.reverse;
      state.directionHold = 0;
      state.gear = 1;
      state.throttle = 0;
    }
  } else state.directionHold = 0;
  state.braking = (state.reverse ? forward : backward) || (forward && backward);
  if (control && !state.reverse) state.braking = control.brake > 0.01;
  const accelerating = state.reverse ? backward : forward;
  state.handbrake = keys.has(" ") || keys.has("space");
  state.throttle = damp(
    state.throttle,
    accelerating && !state.braking ? (control?.throttle ?? 1) : 0,
    accelerating && !state.braking ? 2.3 : 6,
    dt,
  );
  state.shiftTime = Math.max(0, state.shiftTime - dt);
  let wheelRPM = ((state.speed / 0.34) * 60) / (Math.PI * 2);
  let coupledRPM = wheelRPM * RATIOS[state.gear - 1] * 4.4;
  if (state.shiftTime === 0 && !state.reverse) {
    if (coupledRPM > 7600 && state.gear < 7) {
      state.gear++;
      state.shiftTime = 0.19;
    } else if (
      coupledRPM < (state.throttle > 0.6 ? 3800 : 2300) &&
      state.gear > 1
    ) {
      state.gear--;
      state.shiftTime = 0.16;
    }
  }
  coupledRPM = wheelRPM * RATIOS[state.gear - 1] * 4.4;
  state.rpm = damp(
    state.rpm,
    Math.max(850 + state.throttle * 1050, coupledRPM),
    10,
    dt,
  );
  state.turboInput = keys.has("x");
  const boostTarget =
    state.turboInput && accelerating && !state.braking && !state.reverse
      ? clamp((state.rpm - 1400) / 2200, 0, 1)
      : 0;
  state.boost = damp(
    state.boost,
    boostTarget,
    boostTarget > state.boost ? 1.25 : 4,
    dt,
  );
  const boostMultiplier = 1 + state.boost * 1.05;
  const mass = 1640,
    grip = 1 - 0.34 * wetness;
  const torque = 350 + 90 * Math.exp(-(((state.rpm - 6000) / 2300) ** 2));
  const engine =
    state.shiftTime > 0
      ? 0
      : state.throttle *
        Math.min(
          state.reverse ? mass * 1.8 : Infinity,
          ((mass * 4.2) / (1 + state.speed * 0.016)) * (1 + state.boost),
          (220000 * boostMultiplier) / Math.max(8, state.speed),
          (torque * boostMultiplier * RATIOS[state.gear - 1] * 4.4 * 0.87) /
            0.34,
        );
  const drag = 0.5 * 1.225 * 0.9 * state.speed ** 2;
  const rolling =
    state.speed > 0
      ? 0.018 * mass * 9.81
      : Math.min(engine, 0.018 * mass * 9.81);
  const engineBrake =
    state.speed > 0
      ? (((1 - state.throttle) *
          (32 + Math.max(0, state.rpm - 850) * 0.008) *
          RATIOS[state.gear - 1] *
          4.4 *
          0.87) /
          0.34) *
        Math.min(1, state.speed / 3)
      : 0;
  const brake =
    (state.braking ? mass * 9.81 * grip * (control?.brake ?? 1) : 0) +
    (state.handbrake ? mass * 2.3 : 0);
  const oldSpeed = state.speed;
  state.speed = clamp(
    state.speed + ((engine - drag - rolling - brake - engineBrake) / mass) * dt,
    0,
    state.reverse ? 25 / 3.6 : 320 / 3.6,
  );
  state.acceleration = (state.speed - oldSpeed) / Math.max(dt, 0.000001);
  updateBoostEffects(state, dt);
  return oldSpeed;
}
export function stepDriving(state, keys, wetness, dt) {
  if (keys.size) state.autopilot = false;
  const control = state.autopilot ? autopilotControl(state, wetness) : null;
  const oldSpeed = stepPowertrain(state, keys, wetness, dt, control);
  const steering =
    control?.steering ??
    Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
  state.steer = damp(state.steer, steering, steering === 0 ? 9 : 5, dt);
  const oldX = roadCenter(state.progress) + state.offset;
  const oldHeading = state.heading;
  stepTyres(state, dt, 1 - 0.34 * wetness);
  const direction = (oldHeading + state.heading) * 0.5;
  const travelled =
    (oldSpeed + state.speed) * 0.5 * dt * (state.reverse ? -1 : 1);
  const sideways = state.sideSpeed * dt;
  state.progress +=
    travelled * Math.cos(direction) + sideways * Math.sin(direction);
  const desiredOffset =
    oldX -
    travelled * Math.sin(direction) +
    sideways * Math.cos(direction) -
    roadCenter(state.progress);
  state.lateralSpeed = (desiredOffset - state.offset) / Math.max(dt, 0.000001);
  const slip = state.heading + Math.atan(roadTangent(state.progress));
  const bodyHalfWidth =
    CAR_HALF_WIDTH * Math.abs(Math.cos(slip)) +
    2.395 * Math.abs(Math.sin(slip));
  const available = Math.max(
    0,
    DRIVE_HALF_WIDTH -
      bodyHalfWidth * Math.sqrt(1 + roadTangent(state.progress) ** 2) -
      0.16,
  );
  state.offset = clamp(desiredOffset, -available, available);
  state.edgeContact = Math.abs(desiredOffset) > available;
  state.shoulder = clamp(
    (Math.abs(state.offset) + bodyHalfWidth - ROAD_HALF_WIDTH) / SHOULDER_WIDTH,
    0,
    1,
  );
  // The shoulder scrubs speed gently; the outer boundary still contains the car.
  state.speed = Math.max(
    0,
    state.speed - state.shoulder * (0.35 + state.speed * 0.018) * dt,
  );
  if (state.edgeContact) {
    state.speed *= Math.exp(-dt * (0.18 + Math.abs(Math.sin(slip)) * 0.7));
    state.sideSpeed *= Math.exp(-dt * 8);
    state.lateralSpeed = 0;
  }
  state.distance += Math.hypot(travelled, sideways);
  state.acceleration = (state.speed - oldSpeed) / Math.max(dt, 0.000001);
  state.lateralG = clamp((state.speed * state.yawRate) / 9.81, -0.9, 0.9);
  return state;
}
export function advanceDriving(state, keys, wetness, elapsed) {
  let remaining = elapsed;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    stepDriving(state, keys, wetness, dt);
    remaining -= dt;
    if (
      !state.autopilot &&
      state.speed === 0 &&
      keys.size === 0 &&
      state.throttle < 0.0001
    )
      break;
  }
  return state;
}
