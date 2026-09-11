import test from "node:test";
import assert from "node:assert/strict";
import { Route, LANDSCAPES } from "../src/route.js";
test("all maps transition ahead without changing the route behind the car", () => {
  const r = new Route();
  let progress = 0;
  for (const type of LANDSCAPES.slice(1)) {
    const before = r.at(progress),
      start = r.choose(type, progress);
    assert.ok(start - progress >= 96);
    assert.equal(r.at(progress), before);
    assert.deepEqual(r.blend(start), { from: before, to: type, mix: 0 });
    assert.equal(r.blend(start + 48).mix, 0.5);
    assert.deepEqual(r.blend(start + 96), { from: type, to: type, mix: 0 });
    progress = start + 120;
  }
});
test("a new pending selection replaces only the road that has not been entered", () => {
  const r = new Route();
  r.choose("desert", 10);
  const start = r.choose("snow", 10);
  assert.equal(r.at(10), "forest");
  assert.equal(r.at(start + 100), "snow");
  assert.equal(r.changes.length, 2);
});
