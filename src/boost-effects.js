// Short rich-exhaust pulses and pressure release share one simulation clock.
export function updateBoostEffects(state, dt) {
  const previous = state.previousBoost ?? 0;
  const released =
    (state.previousTurbo && !state.turboInput) ||
    (state.previousThrottle > 0.55 && state.throttle <= 0.55);
  const shifted = state.shiftTime > (state.previousShiftTime ?? 0) + 0.05;
  state.blowoff = (state.blowoff ?? 0) * Math.exp(-dt * 6);
  state.exhaust = (state.exhaust ?? 0) * Math.exp(-dt * 13);
  if (released && previous > 0.15) {
    state.blowoff = Math.max(state.blowoff, previous);
    state.exhaust = Math.max(state.exhaust, previous * 0.8);
  }
  if (shifted && previous > 0.3) state.exhaust = 1;
  if (state.reverse) state.exhaust = 0;
  state.previousBoost = state.boost;
  state.previousTurbo = state.turboInput;
  state.previousThrottle = state.throttle;
  state.previousShiftTime = state.shiftTime;
}
