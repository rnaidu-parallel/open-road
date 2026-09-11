import { clamp } from "./driving.js";

// Both V8 recordings are steady loops near 5,570 rpm. Keep overrun audible:
// lifting the throttle changes the exhaust character, not whether it exists.
export function engineMix(state, time) {
  const rpm = clamp(state.rpm, 850, 8200),
    load = state.throttle;
  const flutter =
    1 + 0.003 * Math.sin(time * 17.3) + 0.0015 * Math.sin(time * 31.7);
  const shift = state.shiftTime > 0 ? 0.65 : 1;
  return {
    rate: clamp(rpm / 5570, 0.18, 1.5) * flutter,
    power: (0.12 + 0.68 * Math.sqrt(load)) * shift,
    overrun: (0.5 - 0.33 * load) * shift,
    frequency: 2200 + rpm * 0.42 + load * 2400,
    turbo: (state.boost ?? 0) * 0.07,
  };
}
