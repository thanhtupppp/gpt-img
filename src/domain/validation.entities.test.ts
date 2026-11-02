import { describe, expect, it } from "vitest";
import { PIECS_SCHEMA_VERSION } from "./types";
import {
  isPiecsCommand,
  isPiecsProfile,
  isPiecsWorkflow,
  validateCommand,
  validateProfile,
  validateWorkflow,
} from "./validation";

const command = {
  id: "remove-bg",
  name: "Remove background",
  module: "Edit",
  description: "Remove the source background.",
  syntax: "/remove-bg",
  parameters: [
    { key: "mode", type: "enum", label: "Mode", required: true, options: ["clean", "preserve"] },
    { key: "strength", type: "range", label: "Strength", required: false, min: 0, max: 100 },
  ],
  examples: ["/remove-bg mode=clean"],
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
};

const workflow = {
  id: "product-cleanup",
  name: "Product cleanup",
  description: "Prepare a product image.",
  steps: [{ id: "step-1", commandId: "remove-bg", parameters: { mode: "clean" } }],
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const profile = {
  id: "master",
  name: "Master",
  description: "High quality defaults.",
  defaults: { quality: "high", preserveProduct: true },
  rules: ["Do not distort the product."],
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
};

describe("PIECS command validation", () => {
  it("accepts a valid command", () => {
    expect(validateCommand(command)).toEqual([]);
    expect(isPiecsCommand(command)).toBe(true);
  });

  it("rejects invalid enum definitions and reversed ranges", () => {
    const issues = validateCommand({
      ...command,
      parameters: [
        { key: "mode", type: "enum", label: "Mode", required: true, options: [] },
        { key: "range", type: "range", label: "Range", required: false, min: 10, max: 1 },
      ],
    });
    expect(issues.some((issue) => issue.path === "parameters[0].options")).toBe(true);
    expect(issues.some((issue) => issue.message.includes("min must not exceed max"))).toBe(true);
  });
});

describe("PIECS workflow validation", () => {
  it("accepts a workflow with ordered steps", () => {
    expect(validateWorkflow(workflow)).toEqual([]);
    expect(isPiecsWorkflow(workflow)).toBe(true);
  });

  it("rejects empty workflows and invalid step parameters", () => {
    const issues = validateWorkflow({
      ...workflow,
      steps: [{ id: "step-1", commandId: "remove-bg", parameters: { strength: Number.NaN } }],
    });
    expect(issues.some((issue) => issue.path === "steps" && issue.message.includes("at least one step"))).toBe(false);
    expect(issues.some((issue) => issue.path === "steps[0].parameters")).toBe(true);
    expect(validateWorkflow({ ...workflow, steps: [] }).some((issue) => issue.path === "steps")).toBe(true);
  });
});

describe("PIECS profile validation", () => {
  it("accepts a valid profile", () => {
    expect(validateProfile(profile)).toEqual([]);
    expect(isPiecsProfile(profile)).toBe(true);
  });

  it("rejects non-scalar defaults and missing rules", () => {
    const issues = validateProfile({ ...profile, defaults: { nested: { invalid: true } }, rules: "must preserve" });
    expect(issues.some((issue) => issue.path === "defaults")).toBe(true);
    expect(issues.some((issue) => issue.path === "rules")).toBe(true);
  });
});
