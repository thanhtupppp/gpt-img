import { isPiecsTemplate } from "../domain/validation";
import type { PiecsTemplate } from "../domain/types";

export function exportTemplates(templates: PiecsTemplate[]): string {
  return JSON.stringify({ system: "PIECS", schemaVersion: "1.0.0", exportedAt: new Date().toISOString(), templates }, null, 2);
}

export function parseTemplateImport(source: string): PiecsTemplate[] {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("File JSON không hợp lệ."); }
  if (!parsed || typeof parsed !== "object" || !("templates" in parsed) || !Array.isArray((parsed as {templates:unknown}).templates)) {
    throw new Error("File không đúng định dạng PIECS Library.");
  }
  const items = (parsed as {templates:unknown[]}).templates;
  if (items.some(item => !isPiecsTemplate(item) || item.origin !== "custom")) {
    throw new Error("Chỉ chấp nhận template cá nhân hợp lệ; template hệ thống không thể nhập đè.");
  }
  const ids = new Set<string>();
  for (const item of items as PiecsTemplate[]) {
    if (ids.has(item.id)) throw new Error(`ID template bị trùng trong file: ${item.id}`);
    ids.add(item.id);
  }
  return items as PiecsTemplate[];
}
