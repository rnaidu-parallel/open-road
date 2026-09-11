import { roadCurvature, roadTangent } from "./road.js";
import { steeringLimit } from "./tyres.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function autopilotControl(state, wetness) {
  const speed = state.speed;
  const roadHeading = -Math.atan(roadTangent(state.progress));
  const angle = Math.atan2(
    Math.sin(state.heading - roadHeading),
    Math.cos(state.heading - roadHeading),
  );
  const bend = roadCurvature(state.progress + speed * 0.25);
  const wantedYaw =
    speed * bend +
    1.8 * (angle - state.driftAngle) +
    (2.5 * (1.65 - state.offset)) / Math.max(8, speed);
  const wheelAngle = Math.atan(
    (2.85 / Math.max(4, speed) + 0.0031 * speed) * wantedYaw,
  );
  let targetSpeed = 140 / 3.6;
  // Look far enough ahead to brake before entering a bend, including in rain.
  for (let distance = 0; distance <= 240; distance += 20) {
    const curve = Math.abs(roadCurvature(state.progress + distance));
    const cornerSpeed = Math.sqrt(
      (3.8 * (1 - wetness * 0.34)) / Math.max(0.0001, curve),
    );
    targetSpeed = Math.min(
      targetSpeed,
      Math.sqrt(cornerSpeed ** 2 + 2 * 3.2 * distance),
    );
  }
  if (Math.abs(angle) > 0.4 || state.shoulder > 0.2)
    targetSpeed = Math.min(targetSpeed, 22);
  const error = targetSpeed - speed;
  return {
    steering: clamp(wheelAngle / steeringLimit(speed), -1, 1),
    throttle: state.reverse ? 0 : clamp(error * 0.22 + 0.26, 0, 1),
    brake: state.reverse ? 1 : clamp(-error * 0.2, 0, 1),
    targetSpeed,
  };
}
