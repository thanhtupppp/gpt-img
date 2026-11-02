import { describe, expect, it } from "vitest";
import { buildCommandPrompt, moveCommandStep, type CommandBuilderStep } from "./commandBuilder";

const steps: CommandBuilderStep[] = [
  { id: "1", commandId: "analyze", argumentsText: "scope=full" },
  { id: "2", commandId: "remove-bg", argumentsText: "edge=refined" },
];

describe("command builder helpers", () => {
  it("builds ordered slash commands and trims optional arguments", () => {
    expect(buildCommandPrompt(steps)).toBe("/analyze scope=full\n/remove-bg edge=refined");
  });

  it("supports commands without arguments", () => {
    expect(buildCommandPrompt([{ id: "1", commandId: "/qc", argumentsText: "  " }])).toBe("/qc");
  });

  it("ignores empty command IDs", () => {
    expect(buildCommandPrompt([{ id: "1", commandId: " ", argumentsText: "x=1" }])).toBe("");
  });

  it("moves a step without mutating the original array", () => {
    const moved = moveCommandStep(steps, 0, 1);
    expect(moved.map((step) => step.id)).toEqual(["2", "1"]);
    expect(steps.map((step) => step.id)).toEqual(["1", "2"]);
  });

  it("keeps the same array when a move is out of bounds", () => {
    expect(moveCommandStep(steps, 0, -1)).toBe(steps);
  });
});
