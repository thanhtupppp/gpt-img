import { describe, expect, it } from "vitest";
import { commandCatalog } from "../../data/commandCatalog";
import { starterWorkflows } from "../../data/starterWorkflows";
import type { WorkflowStep } from "../../domain/types";
import { buildWorkflowPrompt, moveWorkflowStep, validateWorkflowCommandIds, type WorkflowBuilderStep } from "./workflowBuilder";

const steps: WorkflowBuilderStep[] = [
  { id: "one", commandId: "analyze", parameters: {}, argumentsText: "scope=full" },
  { id: "two", commandId: "/retouch", parameters: {}, argumentsText: "" },
];

describe("workflow builder helpers", () => {
  it("builds an ordered prompt and normalizes command slashes", () => {
    expect(buildWorkflowPrompt(steps)).toBe("/analyze scope=full\n/retouch");
  });

  it("returns an empty prompt for no steps", () => {
    expect(buildWorkflowPrompt([])).toBe("");
  });

  it("moves steps immutably and keeps boundaries safe", () => {
    const moved = moveWorkflowStep(steps, 0, 1);
    expect(moved.map((step) => step.id)).toEqual(["two", "one"]);
    expect(steps.map((step) => step.id)).toEqual(["one", "two"]);
    expect(moveWorkflowStep(steps, 0, -1)).toBe(steps);
  });

  it("reports missing and unknown command IDs", () => {
    const invalid: WorkflowStep[] = [
      { id: "one", commandId: "", parameters: {} },
      { id: "two", commandId: "not-real", parameters: {} },
    ];
    expect(validateWorkflowCommandIds(invalid, new Set(["analyze"]))).toEqual([
      "Step 1: command is required.",
      'Step 2: unknown command "not-real".',
    ]);
  });

  it("provides starter workflows containing only registered command IDs", () => {
    const knownIds = new Set(commandCatalog.map((command) => command.id));
    expect(starterWorkflows.length).toBeGreaterThanOrEqual(3);
    for (const starter of starterWorkflows) {
      expect(starter.steps.length).toBeGreaterThan(0);
      for (const step of starter.steps) expect(knownIds.has(step.commandId)).toBe(true);
    }
  });

  it("accepts known command IDs", () => {
    expect(validateWorkflowCommandIds(steps, new Set(["analyze", "retouch"]))).toEqual([]);
  });
});
