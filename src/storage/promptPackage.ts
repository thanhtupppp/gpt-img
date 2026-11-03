import {
  PIECS_SCHEMA_VERSION,
  type ParameterDefinition,
  type PiecsTemplate,
  type PiecsWorkflow,
} from "../domain/types";
import { validateTemplate, validateWorkflow } from "../domain/validation";
import { openDatabase, requestResult, transactionComplete } from "./database";

export const PROMPT_PACKAGE_FORMAT = "piecs-prompt-package" as const;
export const PROMPT_PACKAGE_VERSION = "1.0.0" as const;
export const MAX_PROMPT_PACKAGE_BYTES = 5 * 1024 * 1024;

export interface PromptPackage {
  format: typeof PROMPT_PACKAGE_FORMAT;
  packageVersion: typeof PROMPT_PACKAGE_VERSION;
  exportedAt: string;
  templates: PiecsTemplate[];
  workflows: PiecsWorkflow[];
}

export class PromptPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptPackageError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function sanitizeTemplate(value: PiecsTemplate): PiecsTemplate {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    category: value.category,
    profile: value.profile,
    commandIds: [...value.commandIds],
    parameters: { ...value.parameters },
    tags: [...value.tags],
    origin: "custom",
    version: value.version,
    schemaVersion: PIECS_SCHEMA_VERSION,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function sanitizeWorkflow(value: PiecsWorkflow): PiecsWorkflow {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    steps: value.steps.map((step) => ({
      id: step.id,
      commandId: step.commandId,
      parameters: { ...step.parameters },
    })),
    version: value.version,
    schemaVersion: PIECS_SCHEMA_VERSION,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/** Build a portable package from custom templates and workflows. */
export function createPromptPackage(input: {
  templates: PiecsTemplate[];
  workflows: PiecsWorkflow[];
}): PromptPackage {
  return {
    format: PROMPT_PACKAGE_FORMAT,
    packageVersion: PROMPT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    templates: input.templates.filter((item) => item.origin === "custom").map(sanitizeTemplate),
    workflows: input.workflows.map(sanitizeWorkflow),
  };
}

export function serializePromptPackage(value: PromptPackage): string {
  const serialized = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROMPT_PACKAGE_BYTES) {
    throw new PromptPackageError("Prompt Package exceeds the 5 MB limit.");
  }
  return serialized;
}

/** Parse and whitelist package fields; unknown fields (including injected secrets) are discarded. */
export function parsePromptPackage(serialized: string): PromptPackage {
  if (typeof serialized !== "string" || !serialized.trim()) {
    throw new PromptPackageError("Prompt Package content is empty.");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROMPT_PACKAGE_BYTES) {
    throw new PromptPackageError("Prompt Package exceeds the 5 MB limit.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new PromptPackageError("Prompt Package must contain valid JSON.");
  }
  if (!isRecord(raw)) throw new PromptPackageError("Prompt Package must be a JSON object.");
  if (raw.format !== PROMPT_PACKAGE_FORMAT) throw new PromptPackageError("Unrecognized Prompt Package format.");
  if (raw.packageVersion !== PROMPT_PACKAGE_VERSION) {
    throw new PromptPackageError(`Unsupported Prompt Package version; expected ${PROMPT_PACKAGE_VERSION}.`);
  }
  if (typeof raw.exportedAt !== "string" || !Number.isFinite(Date.parse(raw.exportedAt))) {
    throw new PromptPackageError("Prompt Package exportedAt must be a valid date.");
  }
  if (!Array.isArray(raw.templates) || !Array.isArray(raw.workflows)) {
    throw new PromptPackageError("Prompt Package must include templates and workflows arrays.");
  }
  if (raw.templates.length + raw.workflows.length === 0) {
    throw new PromptPackageError("Prompt Package does not contain any templates or workflows.");
  }

  const templates: PiecsTemplate[] = raw.templates.map((item, index) => {
    const candidate = isRecord(item) ? { ...item, origin: "custom" } : item;
    const issues = validateTemplate(candidate);
    if (issues.length) throw new PromptPackageError(`Invalid template at index ${index}: ${issues[0].path} ${issues[0].message}`);
    return sanitizeTemplate(candidate as PiecsTemplate);
  });
  const workflows: PiecsWorkflow[] = raw.workflows.map((item, index) => {
    const issues = validateWorkflow(item);
    if (issues.length) throw new PromptPackageError(`Invalid workflow at index ${index}: ${issues[0].path} ${issues[0].message}`);
    return sanitizeWorkflow(item as PiecsWorkflow);
  });

  assertUniqueIds(templates, workflows);
  return {
    format: PROMPT_PACKAGE_FORMAT,
    packageVersion: PROMPT_PACKAGE_VERSION,
    exportedAt: raw.exportedAt,
    templates,
    workflows,
  };
}

function assertUniqueIds(templates: PiecsTemplate[], workflows: PiecsWorkflow[]): void {
  const templateIds = new Set<string>();
  for (const template of templates) {
    if (templateIds.has(template.id)) throw new PromptPackageError(`Duplicate template ID in package: ${template.id}`);
    templateIds.add(template.id);
  }
  const workflowIds = new Set<string>();
  for (const workflow of workflows) {
    if (workflowIds.has(workflow.id)) throw new PromptPackageError(`Duplicate workflow ID in package: ${workflow.id}`);
    workflowIds.add(workflow.id);
  }
}

/** Import both entity types atomically; a collision or invalid record writes nothing. */
export async function importPromptPackage(value: PromptPackage): Promise<{ templates: number; workflows: number }> {
  const checked = parsePromptPackage(JSON.stringify(value));
  const database = await openDatabase();
  const transaction = database.transaction(["templates", "workflows"], "readwrite");
  const completed = transactionComplete(transaction);
  const templateStore = transaction.objectStore("templates");
  const workflowStore = transaction.objectStore("workflows");

  try {
    const [existingTemplates, existingWorkflows] = await Promise.all([
      requestResult(templateStore.getAll()) as Promise<PiecsTemplate[]>,
      requestResult(workflowStore.getAll()) as Promise<PiecsWorkflow[]>,
    ]);
    const templateIds = new Set(existingTemplates.map((item) => item.id));
    const workflowIds = new Set(existingWorkflows.map((item) => item.id));
    const templateCollision = checked.templates.find((item) => templateIds.has(item.id));
    if (templateCollision) throw new PromptPackageError(`Template ID ${templateCollision.id} already exists; nothing was imported.`);
    const workflowCollision = checked.workflows.find((item) => workflowIds.has(item.id));
    if (workflowCollision) throw new PromptPackageError(`Workflow ID ${workflowCollision.id} already exists; nothing was imported.`);

    checked.templates.forEach((item) => templateStore.add(item));
    checked.workflows.forEach((item) => workflowStore.add(item));
    await completed;
    return { templates: checked.templates.length, workflows: checked.workflows.length };
  } catch (error) {
    transaction.abort();
    await completed.catch(() => undefined);
    if (error instanceof PromptPackageError) throw error;
    throw new PromptPackageError(error instanceof Error ? error.message : "Unable to import Prompt Package.");
  }
}

export async function exportPromptPackage(): Promise<PromptPackage> {
  const database = await openDatabase();
  const transaction = database.transaction(["templates", "workflows"], "readonly");
  const [templates, workflows] = await Promise.all([
    requestResult(transaction.objectStore("templates").getAll()) as Promise<PiecsTemplate[]>,
    requestResult(transaction.objectStore("workflows").getAll()) as Promise<PiecsWorkflow[]>,
  ]);
  await transactionComplete(transaction);
  return createPromptPackage({
    templates: templates.filter((item) => item.origin === "custom"),
    workflows,
  });
}
