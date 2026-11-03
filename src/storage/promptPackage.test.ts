import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { PIECS_SCHEMA_VERSION, type PiecsTemplate, type PiecsWorkflow } from "../domain/types";
import { closeDatabaseForTests } from "./database";
import {
  createPromptPackage,
  exportPromptPackage,
  importPromptPackage,
  parsePromptPackage,
  PromptPackageError,
  serializePromptPackage,
} from "./promptPackage";
import { listTemplates } from "./templateRepository";
import { listWorkflows } from "./workflowRepository";

const template: PiecsTemplate = {
  id: "TPL-CUSTOM-1",
  name: "Product hero",
  description: "Create a product hero image.",
  category: "Product",
  profile: "Studio",
  commandIds: ["image.generate"],
  parameters: { aspectRatio: "4:5", quality: "high" },
  tags: ["product", "studio"],
  origin: "custom",
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const workflow: PiecsWorkflow = {
  id: "WF-CUSTOM-1",
  name: "Product workflow",
  description: "Prepare and generate a product image.",
  steps: [{ id: "step-1", commandId: "image.generate", parameters: { style: "commercial" } }],
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(async () => {
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

describe("Prompt Package", () => {
  it("round-trips custom templates and workflows", () => {
    const value = createPromptPackage({ templates: [template], workflows: [workflow] });
    const parsed = parsePromptPackage(serializePromptPackage(value));
    expect(parsed.templates).toEqual([template]);
    expect(parsed.workflows).toEqual([workflow]);
  });

  it("excludes system templates from exports", () => {
    const system = { ...template, id: "TPL-SYSTEM", origin: "system" as const };
    expect(createPromptPackage({ templates: [system], workflows: [] }).templates).toEqual([]);
  });

  it("strips unknown fields that could carry secrets", () => {
    const value = createPromptPackage({ templates: [template], workflows: [workflow] });
    const injected = {
      ...value,
      adminToken: "must-not-survive",
      templates: [{ ...template, apiKey: "must-not-survive", parameters: { safe: "yes" } }],
      workflows: [{ ...workflow, providerCredential: "must-not-survive" }],
    };
    const parsed = parsePromptPackage(JSON.stringify(injected));
    const output = JSON.stringify(parsed);
    expect(output).not.toContain("must-not-survive");
    expect(output).not.toContain("adminToken");
    expect(parsed.templates[0].parameters).toEqual({ safe: "yes" });
  });

  it("rejects invalid JSON, unknown formats, and unsupported package versions", () => {
    expect(() => parsePromptPackage("{")).toThrow(PromptPackageError);
    const value = createPromptPackage({ templates: [template], workflows: [] });
    expect(() => parsePromptPackage(JSON.stringify({ ...value, format: "other" }))).toThrow("Unrecognized");
    expect(() => parsePromptPackage(JSON.stringify({ ...value, packageVersion: "9.0.0" }))).toThrow("Unsupported");
  });

  it("rejects invalid entities and duplicate IDs", () => {
    const value = createPromptPackage({ templates: [template], workflows: [workflow] });
    expect(() => parsePromptPackage(JSON.stringify({ ...value, templates: [{ ...template, parameters: [] }] }))).toThrow("Invalid template");
    expect(() => parsePromptPackage(JSON.stringify({ ...value, templates: [template, template] }))).toThrow("Duplicate template ID");
  });

  it("enforces the package byte limit", () => {
    expect(() => parsePromptPackage(" ".repeat(5 * 1024 * 1024 + 1))).toThrow("5 MB limit");
  });

  it("imports templates and workflows together", async () => {
    const value = createPromptPackage({ templates: [template], workflows: [workflow] });
    await expect(importPromptPackage(value)).resolves.toEqual({ templates: 1, workflows: 1 });
    expect(await listTemplates()).toEqual([template]);
    expect(await listWorkflows()).toEqual([workflow]);
  });

  it("rejects cross-entity collisions without partially importing either type", async () => {
    const value = createPromptPackage({ templates: [template], workflows: [workflow] });
    await importPromptPackage(createPromptPackage({ templates: [template], workflows: [] })).catch(() => undefined);
    // Seed a workflow collision after confirming template storage is independent.
    await importPromptPackage(createPromptPackage({ templates: [], workflows: [workflow] }));
    await expect(importPromptPackage(value)).rejects.toThrow("already exists");
    expect(await listTemplates()).toEqual([]);
    expect(await listWorkflows()).toEqual([workflow]);
  });

  it("exports only user-owned templates and all workflows from IndexedDB", async () => {
    const database = await (await import("./database")).openDatabase();
    const transaction = database.transaction(["templates", "workflows"], "readwrite");
    transaction.objectStore("templates").put(template);
    transaction.objectStore("templates").put({ ...template, id: "TPL-SYSTEM", origin: "system" });
    transaction.objectStore("workflows").put(workflow);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const value = await exportPromptPackage();
    expect(value.templates.map((item) => item.id)).toEqual([template.id]);
    expect(value.workflows).toEqual([workflow]);
  });
});
