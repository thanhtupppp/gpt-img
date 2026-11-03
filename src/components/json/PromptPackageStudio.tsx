import { useRef, useState } from "react";
import { Download, FileJson, FileUp, ShieldCheck } from "lucide-react";
import {
  exportPromptPackage,
  importPromptPackage,
  parsePromptPackage,
  serializePromptPackage,
  type PromptPackage,
} from "../../storage/promptPackage";
import { PromptPackageError } from "../../storage/promptPackage";

function downloadPackage(value: PromptPackage) {
  const content = serializePromptPackage(value);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `piecs-prompt-package-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PromptPackageStudio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<PromptPackage | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const clearMessages = () => { setStatus(""); setError(""); };

  const onFile = async (file?: File) => {
    if (!file) return;
    clearMessages();
    setCandidate(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("File vượt quá giới hạn 5 MiB của Prompt Package.");
      return;
    }
    try {
      const parsed = parsePromptPackage(await file.text());
      setCandidate(parsed);
      setFileName(file.name);
      setStatus("File hợp lệ. Hãy kiểm tra số lượng dữ liệu trước khi xác nhận nhập.");
    } catch (cause) {
      setError(cause instanceof PromptPackageError ? cause.message : "Không thể đọc Prompt Package.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onExport = async () => {
    setBusy(true);
    clearMessages();
    try {
      downloadPackage(await exportPromptPackage());
      setStatus("Đã tạo Prompt Package JSON. File chỉ chứa custom templates và workflows.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xuất Prompt Package.");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (!candidate || busy) return;
    if (!window.confirm(`Xác nhận nhập ${candidate.templates.length} template, ${candidate.workflows.length} sequential workflow và ${candidate.workflowGraphs?.length ?? 0} hybrid graph? Nếu có ID trùng, toàn bộ giao dịch sẽ bị hủy và dữ liệu hiện tại được giữ nguyên.`)) return;
    setBusy(true);
    clearMessages();
    try {
      const result = await importPromptPackage(candidate);
      setStatus(`Nhập thành công: ${result.templates} templates và ${result.workflows} workflows/graphs.`);
      setCandidate(null);
      setFileName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể nhập Prompt Package.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-300"><FileJson size={14}/> PORTABLE LIBRARY DATA</div>
        <h2 className="text-xl font-semibold">Prompt Package</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Sao lưu custom templates, sequential workflows và hybrid DAG workflows. Package được kiểm tra schema và nhập atomic vào IndexedDB cục bộ.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-line bg-panel/60 p-5">
          <div className="flex items-center gap-2 text-slate-200"><Download size={17}/><h3 className="text-sm font-semibold">Export package</h3></div>
          <p className="mt-2 min-h-12 text-xs leading-5 text-slate-400">Xuất custom templates, sequential workflows và hybrid DAG workflows thành JSON. System templates, credentials, asset blobs và execution history không được đưa vào file.</p>
          <button type="button" onClick={() => void onExport()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-50"><Download size={14}/> Export JSON</button>
        </article>
        <article className="rounded-2xl border border-line bg-panel/60 p-5">
          <div className="flex items-center gap-2 text-slate-200"><FileUp size={17}/><h3 className="text-sm font-semibold">Import package</h3></div>
          <p className="mt-2 min-h-12 text-xs leading-5 text-slate-400">Chọn file JSON để kiểm tra định dạng, phiên bản, entity và ID trùng. Không ghi dữ liệu cho đến khi anh xác nhận.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Choose Prompt Package JSON file" className="hidden" onChange={(event) => void onFile(event.target.files?.[0])}/>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-xs text-slate-200 disabled:opacity-50"><FileUp size={14}/> Choose JSON file</button>
        </article>
      </div>
      {candidate && <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/[.05] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-100">Import preview</h3><p className="mt-1 text-xs text-slate-400">{fileName} · Format: {candidate.format} · Version: {candidate.packageVersion}</p></div><span className="rounded-full border border-emerald-400/20 px-3 py-1 text-[11px] text-emerald-200"><ShieldCheck size={12} className="mr-1 inline"/> Validated</span></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-950/60 p-3"><dt className="text-[11px] text-slate-500">Custom templates</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{candidate.templates.length}</dd></div>
          <div className="rounded-xl bg-slate-950/60 p-3"><dt className="text-[11px] text-slate-500">Sequential workflows</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{candidate.workflows.length}</dd></div>
          <div className="rounded-xl bg-slate-950/60 p-3"><dt className="text-[11px] text-slate-500">Hybrid DAG graphs</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{candidate.workflowGraphs?.length ?? 0}</dd></div>
          <div className="rounded-xl bg-slate-950/60 p-3"><dt className="text-[11px] text-slate-500">Exported at</dt><dd className="mt-1 text-xs font-medium">{new Date(candidate.exportedAt).toLocaleString()}</dd></div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-slate-400">Import sẽ không ghi đè dữ liệu đang có. Nếu phát hiện ID trùng ở bất kỳ entity nào, toàn bộ import sẽ bị rollback.</p>
        <button type="button" onClick={() => void onImport()} disabled={busy} className="mt-4 rounded-xl bg-indigo-400 px-4 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-50">{busy ? "Importing..." : "Confirm import"}</button>
      </div>}
      {status && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-200">{status}</p>}
      {error && <p role="alert" aria-live="assertive" className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-xs text-rose-200">{error}</p>}
      <p className="text-[11px] leading-5 text-slate-500">Giới hạn package: 5 MiB. Dữ liệu được xử lý hoàn toàn trong trình duyệt; không upload lên cloud.</p>
    </section>
  );
}
