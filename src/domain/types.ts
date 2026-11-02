export const PIECS_SCHEMA_VERSION = "1.0.0" as const;

export type EntityOrigin = "system" | "custom";
export type TemplateProfile = "Professional" | "Studio" | "Master";
export type ParameterType = "text" | "number" | "boolean" | "enum" | "range";

export interface ParameterDefinition {
  key: string;
  type: ParameterType;
  label: string;
  required: boolean;
  defaultValue?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
}

export interface PiecsTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  profile: TemplateProfile;
  commandIds: string[];
  parameters: Record<string, string | number | boolean>;
  tags: string[];
  origin: EntityOrigin;
  version: string;
  schemaVersion: typeof PIECS_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
}

export interface PiecsCommand {
  id: string;
  name: string;
  module: string;
  description: string;
  syntax: string;
  parameters: ParameterDefinition[];
  examples: string[];
  version: string;
  schemaVersion: typeof PIECS_SCHEMA_VERSION;
}

export interface WorkflowStep {
  id: string;
  commandId: string;
  parameters: Record<string, string | number | boolean>;
}

export interface PiecsWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  version: string;
  schemaVersion: typeof PIECS_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
}

export interface PiecsProfile {
  id: string;
  name: string;
  description: string;
  defaults: Record<string, string | number | boolean>;
  rules: string[];
  version: string;
  schemaVersion: typeof PIECS_SCHEMA_VERSION;
}

export interface ValidationIssue {
  path: string;
  message: string;
}
