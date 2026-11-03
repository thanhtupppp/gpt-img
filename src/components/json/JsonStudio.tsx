import { useEffect, useState } from "react";
import { Download, FileJson, FileUp, ShieldCheck, Braces, Eye } from "lucide-react";
import { exportTemplates, parseTemplateImport } from "../../storage/templateTransfer";
import { exportWorkflows, parseWorkflowImport } from "../../storage/workflowTransfer";
import { importCustomTemplates, listTemplates } from "../../storage/templateRepository";
import { importWorkflows, listWorkflows } from "../../storage/workflowRepository";
import type { PiecsTemplate, PiecsWorkflow } from "../../domain/types";

type DataKind = "templates" | "workflows";

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function JsonStudio({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [kind, setKind] = useState<DataKind>("templates");
  const [source, setSource] = useState("");
  const [baseline, setBaseline] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const dirty = source !== baseline;
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<PiecsTemplate[]>([]);
  const [workflows, setWorkflows] = useState<PiecsWorkflow[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [nextTemplates, nextWorkflows] = await Promise.all([listTemplates(), listWorkflows()]);
    setTemplates(nextTemplates);
    setWorkflows(nextWorkflows);
  };

  useEffect(() => {
    let active = true;
    Promise.all([listTemplates(), listWorkflows()])
      .then(([nextTemplates, nextWorkflows]) => {
        if (active) { setTemplates(nextTemplates); setWorkflows(nextWorkflows); }
      })
      .catch(() => { if (active) setError("Không thể đọc dữ liệu từ IndexedDB."); });
    return () => { active = false; };
  }, []);

  const validate = () => {
    setError("");
    setMessage("");
    try {
      const count = kind === "templates"
        ? parseTemplateImport(source).length
        : parseWorkflowImport(source).length;
      setIssues([]);
      setMessage(`JSON hợp lệ · ${count} bản ghi sẵn sàng để nhập.`);
    } catch (cause) {
      setIssues([cause instanceof Error ? cause.message : "JSON không hợp lệ."]);
    }
  };

  const loadBackup = async () => {
    setError("");
    setMessage("");
    try {
      const content = kind === "templates"
        ? exportTemplates(templates.filter((item) => item.origin === "custom"))
        : exportWorkflows(workflows);
      setSource(content);
      setBaseline(content);
      setIssues([]);
      setMessage("Đã nạp dữ liệu hiện có vào editor.");
    } catch {
      setError("Không thể tạo bản sao lưu.");
    }
  };

  const exportBackup = () => {
    const content = kind === "templates"
      ? exportTemplates(templates.filter((item) => item.origin === "custom"))
      : exportWorkflows(workflows);
    downloadJson(kind === "templates" ? "piecs-templates.json" : "piecs-workflows.json", content);
  };

  const importBackup = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (kind === "templates") {
        const items = parseTemplateImport(source);
        await importCustomTemplates(items);
      } else {
        const items = parseWorkflowImport(source);
        await importWorkflows(items);
      }
      await refresh();
      setBaseline(source);
      setIssues([]);
      setMessage("Nhập dữ liệu thành công. Không có bản ghi hiện tại nào bị ghi đè.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhập dữ liệu.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    const content = await file.text();
    if (dirty && !window.confirm("Bạn có nội dung chưa lưu. Thay thế bằng file mới?")) return;
    setSource(content);
    setBaseline("");
    setIssues([]);
    setError("");
    setMessage(`Đã đọc ${file.name}. Hãy kiểm tra JSON trước khi nhập.`);
  };


  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const changeKind = (next: DataKind) => {
    if (next === kind) return;
    if (dirty && !window.confirm("Bạn có nội dung chưa lưu. Chuyển loại dữ liệu và bỏ nội dung hiện tại?")) return;
    setKind(next);
    setSource("");
    setBaseline("");
    setIssues([]);
    setMessage("");
    setError("");
    setShowPreview(false);
  };

  const formatJson = () => {
    try {
      setSource(JSON.stringify(JSON.parse(source), null, 2));
      setIssues([]);
      setError("");
      setMessage("Đã định dạng JSON.");
    } catch {
      setIssues(["Không thể format: cú pháp JSON đang không hợp lệ."]);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-300"><FileJson size={14}/> LOCAL DATA TOOLKIT</div>
          <h2 className="text-xl font-semibold">JSON Studio</h2>
          <p className="mt-1 text-sm text-slate-400">Kiểm tra, sao lưu và khôi phục dữ liệu PIECS trên thiết bị này.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-xl border px-3 py-2 text-xs ${dirty ? "border-amber-400/20 bg-amber-400/5 text-amber-200" : "border-emerald-400/20 bg-emerald-400/5 text-emerald-200"}`}>{dirty ? "Unsaved changes" : "No unsaved changes"}</span><div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200"><ShieldCheck size={14}/> Local-first · No cloud upload</div></div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/60 p-4">
        <div className="flex gap-2" role="group" aria-label="JSON data type">
          <button type="button" aria-pressed={kind === "templates"} onClick={() => changeKind("templates")} className={`rounded-lg px-3 py-2 text-xs ${kind === "templates" ? "bg-indigo-400 text-slate-950" : "border border-line text-slate-400"}`}>Templates ({templates.filter((item) => item.origin === "custom").length})</button>
          <button type="button" aria-pressed={kind === "workflows"} onClick={() => changeKind("workflows")} className={`rounded-lg px-3 py-2 text-xs ${kind === "workflows" ? "bg-indigo-400 text-slate-950" : "border border-line text-slate-400"}`}>Workflows ({workflows.length})</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { if (!dirty || window.confirm("Thay thế nội dung chưa lưu bằng dữ liệu trong thư viện?")) void loadBackup(); }} className="rounded-lg border border-line px-3 py-2 text-xs text-slate-300">Load library JSON</button>
          <button type="button" onClick={exportBackup} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-300"><Download size={13}/> Export backup</button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-300"><FileUp size={13}/> Open JSON<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ""; }}/></label>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">JSON document
            <textarea value={source} onChange={(event) => { setSource(event.target.value); setIssues([]); setMessage(""); setError(""); }} spellCheck={false} rows={22} placeholder="Paste a PIECS JSON backup or open a .json file..." className="mt-2 w-full rounded-xl border border-line bg-[#090d16] p-4 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-indigo-400/60"/>
          </label>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={formatJson} disabled={!source.trim()} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs text-slate-300 disabled:opacity-40"><Braces size={13}/> Format JSON</button>
              <button type="button" onClick={() => setShowPreview(value => !value)} disabled={!source.trim()} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs text-slate-300 disabled:opacity-40"><Eye size={13}/>{showPreview ? "Hide preview" : "Preview"}</button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={validate} disabled={!source.trim()} className="rounded-xl border border-line px-4 py-2.5 text-xs text-slate-300 disabled:opacity-40">Validate JSON</button>
            <button type="button" onClick={() => { if (window.confirm("Xác nhận nhập dữ liệu vào thư viện? Bản ghi trùng ID sẽ bị từ chối; dữ liệu hiện tại không bị ghi đè.")) void importBackup(); }} disabled={!source.trim() || busy} className="rounded-xl bg-indigo-400 px-4 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-40">{busy ? "Importing..." : "Import to library"}</button>
          </div>
          </div>
          {showPreview && <div className="overflow-hidden rounded-xl border border-line bg-[#090d16]"><div className="border-b border-line px-4 py-2 text-xs text-slate-400">JSON preview · read only</div><pre className="max-h-[520px] overflow-auto p-4 text-xs leading-5 text-slate-300">{(() => { try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return "JSON chưa hợp lệ. Hãy sửa cú pháp trước khi xem trước."; } })()}</pre></div>}
        </div>
        <aside className="space-y-3">
          <div className="rounded-2xl border border-line bg-panel/60 p-4">
            <h3 className="text-sm font-semibold">Validation report</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Chỉ nhập dữ liệu đúng schema hiện tại. Import bị từ chối nếu có ID trùng; dữ liệu hiện tại không bị ghi đè.</p>
            {message && <p role="status" className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-200">{message}</p>}
            {error && <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</p>}
            {issues.length > 0 && <ul className="mt-4 space-y-2">{issues.map((issue, index) => <li key={index} className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{issue}</li>)}</ul>}
            {!message && !error && issues.length === 0 && <p className="mt-4 text-xs text-slate-600">Chưa có báo cáo. Nhấn Validate JSON để kiểm tra.</p>}
          </div>
          <div className="rounded-2xl border border-line bg-panel/60 p-4">
            <h3 className="text-sm font-semibold">Storage overview</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400"><dt>System templates</dt><dd>{templates.filter((item) => item.origin === "system").length}</dd></div>
              <div className="flex justify-between text-slate-400"><dt>Custom templates</dt><dd>{templates.filter((item) => item.origin === "custom").length}</dd></div>
              <div className="flex justify-between text-slate-400"><dt>Saved workflows</dt><dd>{workflows.length}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}
