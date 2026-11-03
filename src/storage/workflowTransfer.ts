import { PIECS_SCHEMA_VERSION } from "../domain/types";
import { isPiecsWorkflow } from "../domain/validation";
import type { PiecsWorkflow } from "../domain/types";

export function exportWorkflows(workflows: PiecsWorkflow[]): string {
  return JSON.stringify({
    system: "PIECS",
    schemaVersion: PIECS_SCHEMA_VERSION,
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
  const envelope = parsed as { system?: unknown; schemaVersion?: unknown; workflows: unknown[] };
  if (envelope.system !== "PIECS") throw new Error("Nguồn dữ liệu không phải package PIECS.");
  if (envelope.schemaVersion !== PIECS_SCHEMA_VERSION) {
    throw new Error(`Phiên bản schema không được hỗ trợ. Cần ${PIECS_SCHEMA_VERSION}; hãy chuyển đổi bằng phiên bản PIECS tương thích.`);
  }
  const items = envelope.workflows;
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
