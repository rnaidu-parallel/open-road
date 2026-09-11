export const LANDSCAPES = ["forest", "desert", "snow", "night"];
export const SECTION_LENGTH = 96;
export class Route {
  constructor(initial = "forest") {
    this.changes = [{ start: -Infinity, type: initial }];
  }
  at(s) {
    let type = this.changes[0].type;
    for (const change of this.changes) {
      if (s < change.start) break;
      type = change.type;
    }
    return type;
  }
  blend(s) {
    let from = this.changes[0].type;
    for (const change of this.changes) {
      if (change.start === -Infinity) continue;
      if (s < change.start) return { from, to: from, mix: 0 };
      if (s < change.start + SECTION_LENGTH)
        return {
          from,
          to: change.type,
          mix: (s - change.start) / SECTION_LENGTH,
        };
      from = change.type;
    }
    return { from, to: from, mix: 0 };
  }
  choose(type, progress) {
    if (!LANDSCAPES.includes(type)) throw new Error("Unknown landscape");
    const start = (Math.floor(progress / SECTION_LENGTH) + 2) * SECTION_LENGTH;
    this.changes = this.changes.filter((c) => c.start < start);
    const previous = this.changes.at(-1).type;
    if (previous !== type) this.changes.push({ start, type });
    return start;
  }
}
