import { DRIVE_HALF_WIDTH } from "./driving.js";
// The whole footprint must clear the road, not just the model's origin.
// 2.7 also covers the maximum centreline slope plus wind displacement.
export function safeSceneryOffset(offset, radius) {
  return (
    Math.sign(offset) *
    Math.max(Math.abs(offset), DRIVE_HALF_WIDTH + 0.8 + radius * 2.7)
  );
}

// Include leaning trunks and low branches, even when their origin clears the road.
// Triangles crossing the clearance height count in full.
export function sceneryFootprint(parts, maxHeight = Infinity) {
  let radius = 0;
  for (const { geometry } of parts) {
    const p = geometry.attributes.position,
      index = geometry.index,
      count = index?.count ?? p.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map((j) =>
        index ? index.getX(i + j) : i + j,
      );
      if (vertices.every((v) => p.getY(v) > maxHeight)) continue;
      for (const v of vertices)
        radius = Math.max(radius, Math.abs(p.getX(v)), Math.abs(p.getZ(v)));
    }
  }
  return radius;
}
