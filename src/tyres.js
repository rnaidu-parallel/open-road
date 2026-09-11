import { clamp, damp } from "./driving.js";

// Compensate tyre understeer as well as wheelbase geometry at highway speeds.
export function steeringLimit(speed, handbrake = false) {
  const lateral = handbrake ? 12 : 10;
  return Math.min(
    0.62,
    Math.atan((2.85 * lateral) / Math.max(8, speed) ** 2) + 0.0031 * lateral,
  );
}

// Single-track tyre forces: front steering creates yaw; rear grip loss creates
// oversteer. Countersteering and recovered rear grip catch the slide.
export function stepTyres(state, dt, grip) {
  const speed = state.speed,
    mass = 1640,
    front = 1.32,
    rear = 1.53;
  state.rearGrip = damp(
    state.rearGrip ?? 1,
    state.handbrake ? 0.28 : 1,
    state.handbrake ? 3 : 2,
    dt,
  );
  const countersteer =
    state.steer * state.yawRate < 0 ? Math.abs(state.driftAngle) * 1.2 : 0;
  state.steeringAngle =
    state.steer *
    Math.min(0.65, steeringLimit(speed, state.handbrake) + countersteer);
  if (speed < 4 || state.reverse) {
    state.sideSpeed = damp(state.sideSpeed ?? 0, 0, 6, dt);
    state.yawRate = damp(
      state.yawRate,
      ((state.reverse ? -speed : speed) / 2.85) * Math.tan(state.steeringAngle),
      7,
      dt,
    );
  } else {
    const vy = state.sideSpeed ?? 0,
      r = state.yawRate;
    const frontSlip = state.steeringAngle - Math.atan2(vy + front * r, speed);
    const rearSlip = -Math.atan2(vy - rear * r, speed);
    const frontLimit = mass * 9.81 * 0.537 * grip,
      rearLimit = mass * 9.81 * 0.463 * grip * state.rearGrip;
    const fyFront = frontLimit * Math.tanh((70000 * frontSlip) / frontLimit);
    const fyRear = rearLimit * Math.tanh((80000 * rearSlip) / rearLimit);
    state.sideSpeed = clamp(
      vy + ((fyFront + fyRear) / mass - speed * r) * dt,
      -speed * 0.85,
      speed * 0.85,
    );
    state.yawRate = clamp(
      r +
        ((front * fyFront - rear * fyRear) / 2600 -
          r *
            ((state.handbrake ? 0.55 : 1.2) +
              Math.abs(state.driftAngle) * 0.8)) *
          dt,
      -0.85,
      0.85,
    );
  }
  state.heading -= state.yawRate * dt;
  state.driftAngle = Math.atan2(state.sideSpeed ?? 0, Math.max(1, speed));
  state.driftAmount = clamp((Math.abs(state.driftAngle) - 0.025) / 0.4, 0, 1);
  state.bodyYaw = 0;
}
