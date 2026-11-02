import { PIECS_SCHEMA_VERSION, type PiecsTemplate } from "../domain/types";
import type { Template } from "../types";
import { seedSystemTemplates } from "./templateRepository";

export function toSystemTemplate(template: Template, timestamp: string): PiecsTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    profile: template.profile,
    commandIds: template.commands.map((command) => command.replace(/^\\//, "")),
    parameters: {},
    tags: [...template.tags],
    origin: "system",
    version: "1.0.0",
    schemaVersion: PIECS_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function initializeTemplateLibrary(templates: Template[]): Promise<void> {
  const timestamp = new Date().toISOString();
  await seedSystemTemplates(templates.map((template) => toSystemTemplate(template, timestamp)));
}
