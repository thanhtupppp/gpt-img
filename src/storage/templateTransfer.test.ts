import { describe, expect, it } from "vitest";
import { PIECS_SCHEMA_VERSION, type PiecsTemplate } from "../domain/types";
import { exportTemplates, parseTemplateImport } from "./templateTransfer";

const fixture: PiecsTemplate = {
  id: "CUSTOM-1", name: "My preset", description: "Local preset", category: "Product Photography",
  profile: "Master", commandIds: ["analyze"], parameters: {}, tags: ["test"], origin: "custom",
  version: "1.0.0", schemaVersion: PIECS_SCHEMA_VERSION, createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("template transfer", () => {
  it("round-trips custom templates", () => {
    expect(parseTemplateImport(exportTemplates([fixture]))).toEqual([fixture]);
  });
  it("rejects unknown package sources and unsupported schema versions", () => {
    const bundle = JSON.parse(exportTemplates([fixture])) as Record<string, unknown>;
    expect(() => parseTemplateImport(JSON.stringify({ ...bundle, system: "OTHER" }))).toThrow("PIECS");
    expect(() => parseTemplateImport(JSON.stringify({ ...bundle, schemaVersion: "9.9.9" }))).toThrow("schema");
    expect(() => parseTemplateImport(JSON.stringify({ templates: [fixture] }))).toThrow("PIECS");
  });
  it("rejects malformed JSON and invalid or system records", () => {
    expect(() => parseTemplateImport("{")).toThrow("JSON");
    expect(() => parseTemplateImport(JSON.stringify({system:"PIECS",schemaVersion:PIECS_SCHEMA_VERSION,templates:[{...fixture,origin:"system"}]}))).toThrow("template cá nhân");
  });
  it("rejects duplicate IDs in one import file", () => {
    expect(() => parseTemplateImport(exportTemplates([fixture, fixture]))).toThrow("trùng");
  });
});
