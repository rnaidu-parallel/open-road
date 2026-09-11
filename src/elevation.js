// Mirror the sampled terrain at each boundary so long drives do not jump at a seam.
export function sampleElevation(data, size, x, z) {
  const mirror = (v) => {
    const t = ((v % 2) + 2) % 2;
    return t > 1 ? 2 - t : t;
  };
  const u = mirror(x) * (size - 1),
    v = mirror(z) * (size - 1),
    i = Math.floor(u),
    j = Math.floor(v);
  const a = data[j * size + i],
    b = data[j * size + Math.min(size - 1, i + 1)],
    c = data[Math.min(size - 1, j + 1) * size + i],
    d = data[Math.min(size - 1, j + 1) * size + Math.min(size - 1, i + 1)];
  const top = a + (b - a) * (u - i),
    bottom = c + (d - c) * (u - i);
  return top + (bottom - top) * (v - j);
}
