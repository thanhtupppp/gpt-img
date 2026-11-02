import { isPiecsTemplate } from "../domain/validation";
import type { PiecsTemplate } from "../domain/types";
import { openDatabase, requestResult, transactionComplete } from "./database";

export class TemplateRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRepositoryError";
  }
}

export async function listTemplates(): Promise<PiecsTemplate[]> {
  const database = await openDatabase();
  const transaction = database.transaction("templates", "readonly");
  const result = await requestResult(transaction.objectStore("templates").getAll()) as PiecsTemplate[];
  await transactionComplete(transaction);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTemplate(id: string): Promise<PiecsTemplate | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction("templates", "readonly");
  const result = await requestResult(transaction.objectStore("templates").get(id)) as PiecsTemplate | undefined;
  await transactionComplete(transaction);
  return result;
}

export async function saveCustomTemplate(value: unknown): Promise<PiecsTemplate> {
  if (!isPiecsTemplate(value)) {
    throw new TemplateRepositoryError("Template data is invalid or uses an unsupported schema version.");
  }
  if (value.origin !== "custom") {
    throw new TemplateRepositoryError("System templates are read-only. Clone one before editing.");
  }
  const database = await openDatabase();
  const transaction = database.transaction("templates", "readwrite");
  const store = transaction.objectStore("templates");
  const existing = await requestResult(store.get(value.id)) as PiecsTemplate | undefined;
  if (existing?.origin === "system") {
    transaction.abort();
    throw new TemplateRepositoryError("System templates cannot be overwritten.");
  }
  store.put(value);
  await transactionComplete(transaction);
  return value;
}

export async function cloneTemplate(id: string, newId: string, name?: string): Promise<PiecsTemplate> {
  const source = await getTemplate(id);
  if (!source) throw new TemplateRepositoryError("Template not found.");
  if (await getTemplate(newId)) throw new TemplateRepositoryError("A template with this ID already exists.");
  const now = new Date().toISOString();
  const clone: PiecsTemplate = {
    ...source,
    id: newId,
    name: name?.trim() || `${source.name} (Copy)`,
    origin: "custom",
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
    commandIds: [...source.commandIds],
    parameters: { ...source.parameters },
    tags: [...source.tags],
  };
  return saveCustomTemplate(clone);
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const template = await getTemplate(id);
  if (!template) return;
  if (template.origin !== "custom") {
    throw new TemplateRepositoryError("System templates cannot be deleted.");
  }
  const database = await openDatabase();
  const transaction = database.transaction(["templates", "favorites"], "readwrite");
  transaction.objectStore("templates").delete(id);
  transaction.objectStore("favorites").delete(id);
  await transactionComplete(transaction);
}

export async function listFavoriteIds(): Promise<string[]> {
  const database = await openDatabase();
  const transaction = database.transaction("favorites", "readonly");
  const records = await requestResult(transaction.objectStore("favorites").getAll()) as Array<{ id: string }>;
  await transactionComplete(transaction);
  return records.map((record) => record.id);
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("favorites", "readwrite");
  const store = transaction.objectStore("favorites");
  if (favorite) store.put({ id });
  else store.delete(id);
  await transactionComplete(transaction);
}

export async function seedSystemTemplates(templates: PiecsTemplate[]): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("templates", "readwrite");
  const store = transaction.objectStore("templates");
  for (const template of templates) {
    if (!isPiecsTemplate(template) || template.origin !== "system") {
      transaction.abort();
      throw new TemplateRepositoryError("Seed data contains an invalid or non-system template.");
    }
    const existing = await requestResult(store.get(template.id)) as PiecsTemplate | undefined;
    if (!existing) store.add(template);
  }
  await transactionComplete(transaction);
}
