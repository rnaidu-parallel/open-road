import { damp, clamp } from "./driving.js";
export const createWeatherState = () => ({
  cloud: 0,
  precipitation: 0,
  wetness: 0,
});
export function updateWeather(state, enabled, snowFraction, dt) {
  state.cloud = damp(state.cloud, enabled ? 1 : 0, 0.16, dt);
  const target = enabled ? clamp((state.cloud - 0.28) / 0.62, 0, 1) : 0;
  state.precipitation = damp(
    state.precipitation,
    target,
    enabled ? 0.3 : 0.18,
    dt,
  );
  state.wetness = damp(
    state.wetness,
    state.precipitation * (1 - snowFraction),
    enabled ? 0.1 : 0.035,
    dt,
  );
  return state;
}
