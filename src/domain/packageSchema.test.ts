import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import packageSchema from "../../schemas/piecs-package-1.0.0.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: true });

ajv.addFormat("uuid", {
  type: "string",
  validate: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
});
ajv.addFormat("date-time", {
  type: "string",
  validate: (value: string) => {
    const hasTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    return hasTimezone && Number.isFinite(Date.parse(value));
  },
});

const validatePackage = ajv.compile(packageSchema);

const template = {
  id: "custom-template-1",
  name: "Product photography",
  description: "A reusable product photography setup.",
  category: "Product Photography",
  profile: "Studio",
  commandIds: ["analyze", "remove-background"],
  parameters: { quality: "high", preserveProduct: true, strength: 80 },
  tags: ["product", "studio"],
  origin: "custom",
  version: "1.0.0",
  schemaVersion: "1.0.0",
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:00:00.000Z",
};

const workflow = {
  id: "workflow-product-prep",
  name: "Prepare product image",
  description: "Analyze and clean up a product photo.",
  steps: [
    { id: "step-1", commandId: "analyze", parameters: { scope: "full" } },
    { id: "step-2", commandId: "remove-background", parameters: { preserve: true } },
  ],
  version: "1.0.0",
  schemaVersion: "1.0.0",
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:00:00.000Z",
};

const validPackage = () => ({
  kind: "piecs.package",
  schemaVersion: "1.0.0",
  packageId: "7e7f9a20-5d1d-4f75-9e24-7d0b5b2d2c01",
  exportedAt: "2026-11-03T00:00:00.000Z",
  source: { name: "PIECS Prompt Studio", version: "0.1.0" },
  content: { templates: [template], workflows: [workflow] },
});

describe("PIECS Package v1 JSON Schema", () => {
  it("compiles as JSON Schema Draft 2020-12 and accepts a package with templates and workflows", () => {
    expect(validatePackage(validPackage())).toBe(true);
  });

  it("rejects missing envelope fields, unsupported versions, and malformed identifiers", () => {
    const missingSource = validPackage() as Record<string, unknown>;
    delete missingSource.source;
    expect(validatePackage(missingSource)).toBe(false);

    expect(validatePackage({ ...validPackage(), schemaVersion: "2.0.0" })).toBe(false);
    expect(validatePackage({ ...validPackage(), packageId: "not-a-uuid" })).toBe(false);
    expect(validatePackage({ ...validPackage(), exportedAt: "2026-11-03" })).toBe(false);
  });

  it("rejects system templates, empty descriptions, and undeclared properties", () => {
    expect(validatePackage({
      ...validPackage(),
      content: { templates: [{ ...template, origin: "system" }], workflows: [] },
    })).toBe(false);
    expect(validatePackage({
      ...validPackage(),
      content: { templates: [{ ...template, description: "" }], workflows: [] },
    })).toBe(false);
    expect(validatePackage({
      ...validPackage(),
      unexpected: "must not pass through",
    })).toBe(false);
    expect(validatePackage({
      ...validPackage(),
      content: { templates: [{ ...template, unexpected: true }], workflows: [] },
    })).toBe(false);
  });

  it("rejects unsafe scalar-map keys and non-scalar values", () => {
    const unsafeParameters = JSON.parse('{"__proto__":"polluted"}') as Record<string, unknown>;
    expect(validatePackage({
      ...validPackage(),
      content: { templates: [{ ...template, parameters: unsafeParameters }], workflows: [] },
    })).toBe(false);
    expect(validatePackage({
      ...validPackage(),
      content: {
        templates: [],
        workflows: [{
          ...workflow,
          steps: [{ id: "step-1", commandId: "analyze", parameters: { nested: { value: true } } }],
        }],
      },
    })).toBe(false);
  });

  it("rejects duplicate command references and empty workflow step lists", () => {
    expect(validatePackage({
      ...validPackage(),
      content: { templates: [{ ...template, commandIds: ["analyze", "analyze"] }], workflows: [] },
    })).toBe(false);
    expect(validatePackage({
      ...validPackage(),
      content: { templates: [], workflows: [{ ...workflow, steps: [] }] },
    })).toBe(false);
  });
});
