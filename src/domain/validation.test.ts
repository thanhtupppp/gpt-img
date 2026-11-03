import { describe, expect, it } from "vitest";
import { isPiecsTemplate, validateTemplate } from "./validation";
import { PIECS_SCHEMA_VERSION, type PiecsTemplate } from "./types";

const validTemplate: PiecsTemplate = {
  id: "PIECS-TEST-001",
  name: "Test template",
  description: "A valid fixture.",
  category: "Product Photography",
  profile: "Master",
  commandIds: ["analyze", "qc"],
  parameters: { quality: "high", seed: 42, enabled: true },
  tags: ["test"],
  origin: "custom",
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("PIECS template validation", () => {
  it("accepts a valid template", () => {
    expect(validateTemplate(validTemplate)).toEqual([]);
    expect(isPiecsTemplate(validTemplate)).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateTemplate(null)).toEqual([{ path: "$", message: "Expected an object." }]);
  });

  it("reports missing required fields and invalid profile", () => {
    const issues = validateTemplate({ ...validTemplate, name: " ", profile: "Unknown" });
    expect(issues).toContainEqual({ path: "name", message: "Expected a non-empty string." });
    expect(issues).toContainEqual({ path: "profile", message: "Expected Professional, Studio, or Master." });
  });

  it("rejects non-finite parameter values", () => {
    const issues = validateTemplate({ ...validTemplate, parameters: { exposure: Number.NaN } });
    expect(issues.some((issue) => issue.path === "parameters")).toBe(true);
  });

  it("treats markup-like text as data and accepts it without executing it", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const value = { ...validTemplate, name: payload, description: payload, tags: [payload] };
    expect(validateTemplate(value)).toEqual([]);
    expect(isPiecsTemplate(value)).toBe(true);
  });

  it("rejects nested objects and prototype-pollution-shaped parameter values", () => {
    const polluted = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const issues = validateTemplate({ ...validTemplate, parameters: polluted });
    expect(issues.some((issue) => issue.path === "parameters")).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rejects unsupported schema versions", () => {
    const issues = validateTemplate({ ...validTemplate, schemaVersion: "0.1.0" });
    expect(issues.some((issue) => issue.path === "schemaVersion")).toBe(true);
  });
});
