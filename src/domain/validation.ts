import {
  PIECS_SCHEMA_VERSION,
  type PiecsCommand,
  type PiecsProfile,
  type PiecsTemplate,
  type PiecsWorkflow,
  type ValidationIssue,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isScalarRecord = (value: unknown): value is Record<string, string | number | boolean> =>
  isRecord(value) && Object.values(value).every((item) =>
    typeof item === "string" || (typeof item === "number" && Number.isFinite(item)) || typeof item === "boolean"
  );
const hasCurrentSchema = (value: Record<string, unknown>) =>
  value.schemaVersion === PIECS_SCHEMA_VERSION;
const requiredStringIssues = (value: Record<string, unknown>, keys: string[]): ValidationIssue[] =>
  keys.filter((key) => !isNonEmptyString(value[key])).map((key) => ({
    path: key,
    message: "Expected a non-empty string.",
  }));

export function validateTemplate(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [{ path: "$", message: "Expected an object." }];
  const issues = requiredStringIssues(value, [
    "id", "name", "description", "category", "version", "createdAt", "updatedAt",
  ]);
  if (!["Professional", "Studio", "Master"].includes(String(value.profile))) {
    issues.push({ path: "profile", message: "Expected Professional, Studio, or Master." });
  }
  if (!isStringArray(value.commandIds)) issues.push({ path: "commandIds", message: "Expected an array of command IDs." });
  if (!isScalarRecord(value.parameters)) issues.push({ path: "parameters", message: "Expected an object containing only string, finite number, or boolean values." });
  if (!isStringArray(value.tags)) issues.push({ path: "tags", message: "Expected an array of strings." });
  if (!["system", "custom"].includes(String(value.origin))) issues.push({ path: "origin", message: "Expected system or custom." });
  if (!hasCurrentSchema(value)) issues.push({ path: "schemaVersion", message: `Unsupported schema version; expected ${PIECS_SCHEMA_VERSION}.` });
  return issues;
}

export function isPiecsTemplate(value: unknown): value is PiecsTemplate {
  return validateTemplate(value).length === 0;
}

export function validateCommand(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [{ path: "$", message: "Expected an object." }];
  const issues = requiredStringIssues(value, ["id", "name", "module", "description", "syntax", "version"]);
  if (!Array.isArray(value.parameters)) {
    issues.push({ path: "parameters", message: "Expected an array of parameter definitions." });
  } else {
    value.parameters.forEach((parameter, index) => {
      const path = `parameters[${index}]`;
      if (!isRecord(parameter)) {
        issues.push({ path, message: "Expected a parameter definition object." });
        return;
      }
      for (const key of ["key", "label"]) {
        if (!isNonEmptyString(parameter[key])) issues.push({ path: `${path}.${key}`, message: "Expected a non-empty string." });
      }
      if (!["text", "number", "boolean", "enum", "range"].includes(String(parameter.type))) {
        issues.push({ path: `${path}.type`, message: "Unsupported parameter type." });
      }
      if (typeof parameter.required !== "boolean") issues.push({ path: `${path}.required`, message: "Expected a boolean." });
      if (parameter.defaultValue !== undefined &&
        !(typeof parameter.defaultValue === "string" || typeof parameter.defaultValue === "boolean" ||
          (typeof parameter.defaultValue === "number" && Number.isFinite(parameter.defaultValue)))) {
        issues.push({ path: `${path}.defaultValue`, message: "Expected a scalar default value." });
      }
      if (parameter.options !== undefined && !isStringArray(parameter.options)) {
        issues.push({ path: `${path}.options`, message: "Expected an array of strings." });
      }
      for (const key of ["min", "max"]) {
        if (parameter[key] !== undefined && (typeof parameter[key] !== "number" || !Number.isFinite(parameter[key]))) {
          issues.push({ path: `${path}.${key}`, message: "Expected a finite number." });
        }
      }
      if (typeof parameter.min === "number" && typeof parameter.max === "number" && parameter.min > parameter.max) {
        issues.push({ path, message: "Parameter min must not exceed max." });
      }
      if (parameter.type === "enum" && (!Array.isArray(parameter.options) || parameter.options.length === 0)) {
        issues.push({ path: `${path}.options`, message: "Enum parameters require at least one option." });
      }
    });
  }
  if (!isStringArray(value.examples)) issues.push({ path: "examples", message: "Expected an array of strings." });
  if (!hasCurrentSchema(value)) issues.push({ path: "schemaVersion", message: `Unsupported schema version; expected ${PIECS_SCHEMA_VERSION}.` });
  return issues;
}

export function isPiecsCommand(value: unknown): value is PiecsCommand {
  return validateCommand(value).length === 0;
}

export function validateWorkflow(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [{ path: "$", message: "Expected an object." }];
  const issues = requiredStringIssues(value, ["id", "name", "description", "version", "createdAt", "updatedAt"]);
  if (!Array.isArray(value.steps)) {
    issues.push({ path: "steps", message: "Expected an array of workflow steps." });
  } else {
    if (value.steps.length === 0) issues.push({ path: "steps", message: "A workflow must contain at least one step." });
    value.steps.forEach((step, index) => {
      const path = `steps[${index}]`;
      if (!isRecord(step)) {
        issues.push({ path, message: "Expected a workflow step object." });
        return;
      }
      if (!isNonEmptyString(step.id)) issues.push({ path: `${path}.id`, message: "Expected a non-empty string." });
      if (!isNonEmptyString(step.commandId)) issues.push({ path: `${path}.commandId`, message: "Expected a non-empty string." });
      if (!isScalarRecord(step.parameters)) issues.push({ path: `${path}.parameters`, message: "Expected scalar parameter values." });
    });
  }
  if (!hasCurrentSchema(value)) issues.push({ path: "schemaVersion", message: `Unsupported schema version; expected ${PIECS_SCHEMA_VERSION}.` });
  return issues;
}

export function isPiecsWorkflow(value: unknown): value is PiecsWorkflow {
  return validateWorkflow(value).length === 0;
}

export function validateProfile(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [{ path: "$", message: "Expected an object." }];
  const issues = requiredStringIssues(value, ["id", "name", "description", "version"]);
  if (!isScalarRecord(value.defaults)) issues.push({ path: "defaults", message: "Expected scalar default values." });
  if (!isStringArray(value.rules)) issues.push({ path: "rules", message: "Expected an array of strings." });
  if (!hasCurrentSchema(value)) issues.push({ path: "schemaVersion", message: `Unsupported schema version; expected ${PIECS_SCHEMA_VERSION}.` });
  return issues;
}

export function isPiecsProfile(value: unknown): value is PiecsProfile {
  return validateProfile(value).length === 0;
}
