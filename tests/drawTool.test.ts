import { describe, expect, it } from "vitest";

import { buildDrawPayload } from "../src/tools/drawTool";

type Box = { kind: string; x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > 0 && overlapY > 0;
}

describe("buildDrawPayload", () => {
  it("separates stickies that overlap after being snapped square", () => {
    // The agent stacks stickies as if they were 120px tall, but the server makes
    // them square (224px), so without separation they would overlap.
    const payload = buildDrawPayload(
      {
        layout: "free",
        elements: [
          { kind: "sticky", id: "a", text: "A", color: "amber", x: 80, y: 80, width: 224, height: 120 },
          { kind: "sticky", id: "b", text: "B", color: "amber", x: 80, y: 220, width: 224, height: 120 },
          { kind: "sticky", id: "c", text: "C", color: "amber", x: 80, y: 360, width: 224, height: 120 },
        ],
      },
      "draw stickies",
    );

    const boxes = payload.elements.filter((element) => element.kind !== "connector") as Box[];
    expect(boxes).toHaveLength(3);
    // Every sticky is square (height === width) and none of them overlap.
    expect(boxes.every((box) => box.width === box.height)).toBe(true);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
      }
    }
  });

  it("respects the agent-provided sticky size as the square side", () => {
    const payload = buildDrawPayload(
      {
        layout: "free",
        elements: [{ kind: "sticky", id: "a", text: "A", color: "amber", x: 0, y: 0, width: 300, height: 90 }],
      },
      "draw a big sticky",
    );

    const sticky = payload.elements.find((element) => element.kind === "sticky") as Box;
    expect(sticky.width).toBe(300);
    expect(sticky.height).toBe(300);
  });
});
