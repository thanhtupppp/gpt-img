import { PIECS_SCHEMA_VERSION, type PiecsTemplate, type ValidationIssue } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isScalarRecord = (value: unknown): value is Record<string, string | number | boolean> =>
  isRecord(value) && Object.values(value).every((item) =>
    typeof item === "string" || typeof item === "number" && Number.isFinite(item) || typeof item === "boolean"
  );

export function validateTemplate(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) return [{ path: "$", message: "Expected an object." }];

  const issues: ValidationIssue[] = [];
  const requiredStrings = ["id", "name", "description", "category", "version", "createdAt", "updatedAt"];
  for (const key of requiredStrings) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      issues.push({ path: key, message: "Expected a non-empty string." });
    }
  }
  if (!["Professional", "Studio", "Master"].includes(String(value.profile))) {
    issues.push({ path: "profile", message: "Expected Professional, Studio, or Master." });
  }
  if (!isStringArray(value.commandIds)) {
    issues.push({ path: "commandIds", message: "Expected an array of command IDs." });
  }
  if (!isScalarRecord(value.parameters)) {
    issues.push({ path: "parameters", message: "Expected an object containing only string, finite number, or boolean values." });
  }
  if (!isStringArray(value.tags)) {
    issues.push({ path: "tags", message: "Expected an array of strings." });
  }
  if (!["system", "custom"].includes(String(value.origin))) {
    issues.push({ path: "origin", message: "Expected system or custom." });
  }
  if (value.schemaVersion !== PIECS_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", message: `Unsupported schema version; expected ${PIECS_SCHEMA_VERSION}.` });
  }
  return issues;
}

export function isPiecsTemplate(value: unknown): value is PiecsTemplate {
  return validateTemplate(value).length === 0;
}
