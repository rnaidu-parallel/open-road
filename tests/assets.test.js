import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("compressed car retains the paint, glass, brake and wheel material identities", () => {
  const bytes = readFileSync(
    new URL("../public/assets/car.glb", import.meta.url),
  );
  const document = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  const names = document.materials.map((m) => m.name);
  for (const name of [
    "Mesheszx1Mtl",
    "Meshesbody151Mtl",
    "Mesheslivery1Mtl",
    "Mesheswindows1Mtl",
    "Meshesredlight1Mtl",
    "Caliper1Mtl",
    "Meshesm8rim0011Mtl",
  ])
    assert.ok(names.includes(name), `Missing ${name}`);
  assert.ok(names.every((name) => !name.startsWith("PaletteMaterial")));
});

test("forest foliage stays within its rendering budgets", () => {
  for (const [file, max] of [
    ["tree-near.glb", 15000],
    ["tree-far.glb", 2000],
    ["fern.glb", 23000],
    ["car-reflection.glb", 90000],
  ]) {
    const bytes = readFileSync(
      new URL("../public/assets/" + file, import.meta.url),
    );
    const d = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    const triangles = d.meshes.reduce(
      (n, m) =>
        n +
        m.primitives.reduce((v, p) => v + d.accessors[p.indices].count / 3, 0),
      0,
    );
    assert.ok(triangles <= max);
  }
});
