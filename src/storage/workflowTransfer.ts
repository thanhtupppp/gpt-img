import { isPiecsWorkflow } from "../domain/validation";
import type { PiecsWorkflow } from "../domain/types";

export function exportWorkflows(workflows: PiecsWorkflow[]): string {
  return JSON.stringify({
    system: "PIECS",
    schemaVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    workflows,
  }, null, 2);
}

export function parseWorkflowImport(source: string): PiecsWorkflow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("File JSON không hợp lệ.");
  }
  if (!parsed || typeof parsed !== "object" || !("workflows" in parsed) ||
      !Array.isArray((parsed as { workflows: unknown }).workflows)) {
    throw new Error("File không đúng định dạng PIECS Workflow Library.");
  }
  const items = (parsed as { workflows: unknown[] }).workflows;
  if (items.some((item) => !isPiecsWorkflow(item))) {
    throw new Error("File chứa workflow không hợp lệ hoặc sai schema.");
  }
  const ids = new Set<string>();
  for (const item of items as PiecsWorkflow[]) {
    if (ids.has(item.id)) throw new Error(`ID workflow bị trùng trong file: ${item.id}`);
    ids.add(item.id);
  }
  return items as PiecsWorkflow[];
}
