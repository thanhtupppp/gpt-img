import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "./database";
import {
  cloneTemplate,
  deleteCustomTemplate,
  listFavoriteIds,
  listTemplates,
  saveCustomTemplate,
  seedSystemTemplates,
  setFavorite,
  TemplateRepositoryError,
} from "./templateRepository";
import { PIECS_SCHEMA_VERSION, type PiecsTemplate } from "../domain/types";

const systemTemplate: PiecsTemplate = {
  id: "PIECS-SYSTEM-001",
  name: "System product",
  description: "Seed fixture",
  category: "Product Photography",
  profile: "Master",
  commandIds: ["analyze"],
  parameters: {},
  tags: ["product"],
  origin: "system",
  version: "1.0.0",
  schemaVersion: PIECS_SCHEMA_VERSION,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(async () => {
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

describe("template repository", () => {
  it("seeds system templates without overwriting existing records", async () => {
    await seedSystemTemplates([systemTemplate]);
    await seedSystemTemplates([{ ...systemTemplate, name: "Changed seed" }]);
    const records = await listTemplates();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("System product");
  });

  it("clones a system template into an editable custom template", async () => {
    await seedSystemTemplates([systemTemplate]);
    const clone = await cloneTemplate(systemTemplate.id, "CUSTOM-001", "My product preset");
    expect(clone.origin).toBe("custom");
    expect(clone.name).toBe("My product preset");
    expect(await listTemplates()).toHaveLength(2);
  });

  it("prevents saving over or deleting system templates", async () => {
    await seedSystemTemplates([systemTemplate]);
    await expect(saveCustomTemplate(systemTemplate)).rejects.toBeInstanceOf(TemplateRepositoryError);
    await expect(deleteCustomTemplate(systemTemplate.id)).rejects.toBeInstanceOf(TemplateRepositoryError);
  });

  it("persists favorites and removes them when a custom template is deleted", async () => {
    await seedSystemTemplates([systemTemplate]);
    await setFavorite(systemTemplate.id, true);
    expect(await listFavoriteIds()).toEqual([systemTemplate.id]);
    const clone = await cloneTemplate(systemTemplate.id, "CUSTOM-002");
    await setFavorite(clone.id, true);
    await deleteCustomTemplate(clone.id);
    expect(await listFavoriteIds()).toEqual([systemTemplate.id]);
  });

  it("rejects malformed template data", async () => {
    await expect(saveCustomTemplate({ id: "bad" })).rejects.toBeInstanceOf(TemplateRepositoryError);
  });
});
