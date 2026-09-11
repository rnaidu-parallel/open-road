// Continuous C2 joins between straight sections, broad sweeps and tighter bends.
const sections = [
  { length: 650, to: 0 },
  { length: 340, to: 65 },
  { length: 420, to: 65 },
  { length: 380, to: -20 },
  { length: 3200, to: -20 },
  { length: 440, to: 95 },
  { length: 330, to: 40 },
  { length: 850, to: 40 },
  { length: 280, to: 0 },
];
const PERIOD = sections.reduce((n, s) => n + s.length, 0);
function sectionAt(s) {
  let position = ((s % PERIOD) + PERIOD) % PERIOD,
    from = 0;
  for (const section of sections) {
    if (position < section.length)
      return { ...section, from, t: position / section.length };
    position -= section.length;
    from = section.to;
  }
  return { ...sections[0], from: 0, t: 0 };
}
export function roadCenter(s) {
  const { from, to, t } = sectionAt(s);
  return from + (to - from) * (6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3);
}
export function roadTangent(s) {
  const { from, to, t, length } = sectionAt(s);
  return ((to - from) * (30 * t ** 4 - 60 * t ** 3 + 30 * t ** 2)) / length;
}
export function roadCurvature(s) {
  const { from, to, t, length } = sectionAt(s);
  const second =
    ((to - from) * (120 * t ** 3 - 180 * t ** 2 + 60 * t)) / length ** 2;
  return second / (1 + roadTangent(s) ** 2) ** 1.5;
}
export const ROAD_GLSL = `float roadCenterAt(float s){float q=mod(mod(s,${PERIOD.toFixed(1)})+${PERIOD.toFixed(1)},${PERIOD.toFixed(1)});float previous=0.;${sections.map(({ length, to }) => `if(q<${length.toFixed(1)}){float t=q/${length.toFixed(1)};return mix(previous,${to.toFixed(1)},t*t*t*(t*(t*6.-15.)+10.));}q-=${length.toFixed(1)};previous=${to.toFixed(1)};`).join("")}return 0.;}`;
