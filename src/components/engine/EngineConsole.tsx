import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Clock3, Play, RefreshCw, RotateCcw, Server, ShieldCheck, Square, Workflow } from "lucide-react";
import { listWorkflows } from "../../storage/workflowRepository";
import { deleteEngineJob, getEngineJob, listEngineJobs, saveEngineJob } from "../../storage/engineJobRepository";
import { createEngineJob, executeEngineJob, retryEngineJob } from "../../engine/runtime";
import { demoAdapter } from "../../engine/demoAdapter";
import type { EngineJob, EngineJobStatus } from "../../engine/types";
import type { PiecsWorkflow } from "../../domain/types";

const statusCopy: Record<EngineJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};
const statusClass: Record<EngineJobStatus, string> = {
  queued: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  running: "border-indigo-300/30 bg-indigo-400/10 text-indigo-200",
  succeeded: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
  failed: "border-rose-300/30 bg-rose-400/10 text-rose-200",
  cancelled: "border-amber-300/30 bg-amber-400/10 text-amber-200",
};

export function EngineConsole() {
  const [workflows, setWorkflows] = useState<PiecsWorkflow[]>([]);
  const [jobs, setJobs] = useState<EngineJob[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const [workflowItems, jobItems] = await Promise.all([listWorkflows(), listEngineJobs()]);
    setWorkflows(workflowItems);
    setJobs(jobItems);
    setSelectedWorkflow((current) => current || workflowItems[0]?.id || "");
  };

  useEffect(() => {
    let active = true;
    Promise.all([listWorkflows(), listEngineJobs()])
      .then(([workflowItems, jobItems]) => {
        if (!active) return;
        setWorkflows(workflowItems);
        setJobs(jobItems);
        setSelectedWorkflow(workflowItems[0]?.id ?? "");
      })
      .catch(() => { if (active) setError("Không thể khởi tạo Engine local. Kiểm tra IndexedDB của trình duyệt."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const run = async (workflow: PiecsWorkflow, existing?: EngineJob) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const queued = existing ?? createEngineJob(workflow, `JOB-${crypto.randomUUID()}`);
      await saveEngineJob(queued);
      setSelectedJob(queued.id);
      await refresh();
      await executeEngineJob(queued, demoAdapter, {
        save: saveEngineJob,
        isCancelRequested: async (id) => (await getEngineJob(id))?.cancelRequested ?? false,
        onUpdate: (job) => setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể chạy workflow.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const workflow = workflows.find((item) => item.id === selectedWorkflow);
    if (!workflow) return;
    await run(workflow);
  };

  const retry = async (job: EngineJob) => {
    const workflow = workflows.find((item) => item.id === job.workflowId);
    if (!workflow) {
      setError("Workflow gốc không còn tồn tại nên không thể retry.");
      return;
    }
    try {
      const retried = retryEngineJob(job);
      await saveEngineJob(retried);
      await run(workflow, retried);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể retry job.");
    }
  };

  const cancel = async (job: EngineJob) => {
    await saveEngineJob({ ...job, cancelRequested: true, updatedAt: new Date().toISOString() });
    await refresh();
  };

  const selected = jobs.find((job) => job.id === selectedJob) ?? jobs[0];

  return (
    <section className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-300"><Activity size={14}/> PIECS ENGINE · P7 FOUNDATION</div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">AI Workflow Engine</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Điều phối workflow, theo dõi job và lịch sử chạy. P7 dùng Demo Adapter local; chưa gọi AI provider hoặc tạo ảnh thật.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/[.06] px-3 py-2 text-xs text-emerald-200"><ShieldCheck size={15}/> Local-only · No API keys</div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-panel/70 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 size={14}/> Queue</div><div className="mt-2 text-2xl font-semibold">{jobs.filter((job) => job.status === "queued" || job.status === "running").length}</div></div>
        <div className="rounded-2xl border border-line bg-panel/70 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 size={14}/> Succeeded</div><div className="mt-2 text-2xl font-semibold">{jobs.filter((job) => job.status === "succeeded").length}</div></div>
        <div className="rounded-2xl border border-line bg-panel/70 p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><AlertCircle size={14}/> Failed</div><div className="mt-2 text-2xl font-semibold">{jobs.filter((job) => job.status === "failed").length}</div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4 rounded-2xl border border-line bg-panel/70 p-5">
          <div className="flex items-center gap-2"><Server size={16} className="text-indigo-300"/><h3 className="font-semibold">Execution setup</h3></div>
          <p className="text-xs leading-5 text-slate-500">Chọn workflow đã lưu trong Prompt Studio. Engine nhận bản snapshot và xử lý tách biệt với thư viện template.</p>
          {loading ? <p className="text-xs text-slate-500">Loading...</p> : workflows.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-xs text-slate-500">Chưa có workflow. Tạo và lưu workflow trong mục Workflows trước.</p> : (
            <>
              <label className="block text-xs text-slate-400">Workflow<select value={selectedWorkflow} onChange={(event) => setSelectedWorkflow(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-line bg-[#090d16] px-3 text-sm text-slate-200 outline-none focus:border-indigo-400/60">{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.steps.length} steps</option>)}</select></label>
              <div className="rounded-xl border border-line bg-[#090d16] p-3"><div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Workflow size={14}/> {workflows.find((item) => item.id === selectedWorkflow)?.name}</div><ol className="mt-3 space-y-2">{workflows.find((item) => item.id === selectedWorkflow)?.steps.map((step, index) => <li key={step.id} className="flex items-center gap-2 text-xs text-slate-400"><span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-400/10 text-[10px] text-indigo-200">{index + 1}</span><code>/{step.commandId}</code></li>)}</ol></div>
              <button type="button" disabled={!selectedWorkflow || busy} onClick={start} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"><Play size={15}/> {busy ? "Executing..." : "Run with Demo Adapter"}</button>
            </>
          )}
          <div className="rounded-xl border border-indigo-300/15 bg-indigo-400/[.05] p-3 text-xs leading-5 text-slate-400"><strong className="text-indigo-200">Adapter boundary:</strong> runtime depends on the EngineAdapter interface. P8 can add provider adapters without coupling Prompt Studio to provider SDKs.</div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel/70 p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Queue & execution history</h3><p className="mt-1 text-xs text-slate-500">{jobs.length} local jobs</p></div><button type="button" onClick={() => void refresh()} className="rounded-lg border border-line p-2 text-slate-400 hover:bg-white/5" aria-label="Refresh jobs"><RefreshCw size={14}/></button></div>
            {jobs.length === 0 ? <p className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-slate-500">Chưa có job. Chạy một workflow để bắt đầu.</p> : <ul className="space-y-2">{jobs.map((job) => <li key={job.id} className={`rounded-xl border p-3 ${selected?.id === job.id ? "border-indigo-300/30 bg-indigo-400/[.04]" : "border-line bg-[#090d16]/70"}`}>
              <div className="flex items-start justify-between gap-3"><button type="button" onClick={() => setSelectedJob(job.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium text-slate-200">{job.workflowName}</span><span className="mt-1 block text-[10px] text-slate-500">{job.id} · Attempt {job.attempt}</span></button><span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass[job.status]}`}>{statusCopy[job.status]}</span></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-400 transition-all" style={{width:`${job.progress}%`}}/></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-slate-500">{job.progress}% · {new Date(job.createdAt).toLocaleString()}</span><div className="flex gap-1">
                {(job.status === "failed" || job.status === "cancelled") && <button type="button" onClick={() => void retry(job)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-[10px] text-slate-300 disabled:opacity-40"><RotateCcw size={11}/> Retry</button>}
                {(job.status === "queued" || job.status === "running") && <button type="button" onClick={() => void cancel(job)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300/20 px-2 py-1.5 text-[10px] text-amber-200"><Square size={11}/> Cancel</button>}
                {(job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") && <button type="button" onClick={async () => { await deleteEngineJob(job.id); await refresh(); }} className="rounded-lg border border-line px-2 py-1.5 text-[10px] text-slate-400">Remove</button>}
              </div></div>
            </li>)}</ul>}
          </div>
          {selected && <div className="rounded-2xl border border-line bg-panel/70 p-5"><h3 className="font-semibold">Job details</h3><div className="mt-3 space-y-2">{selected.logs.map((line, index) => <div key={index} className="flex gap-2 text-xs leading-5 text-slate-400"><span className="text-indigo-300">›</span>{line}</div>)}</div>{selected.error && <p role="alert" className="mt-3 rounded-lg bg-rose-400/10 p-3 text-xs text-rose-200">{selected.error}</p>}</div>}
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">{error}</p>}
      <p className="text-[11px] leading-5 text-slate-600">P7 foundation only: the Demo Adapter validates queue lifecycle and logs. Real image input/output, credentials, provider selection, network calls and generation are reserved for P8.</p>
    </section>
  );
}
