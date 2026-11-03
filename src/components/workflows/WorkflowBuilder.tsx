import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Copy, Plus, Save, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { commandCatalog, searchCommands } from "../../data/commandCatalog";
import { starterWorkflows } from "../../data/starterWorkflows";
import { PIECS_SCHEMA_VERSION, type PiecsWorkflow } from "../../domain/types";
import { buildWorkflowPrompt, moveWorkflowStep, validateWorkflowCommandIds, type WorkflowBuilderStep } from "../../features/workflows/workflowBuilder";
import { cloneWorkflow, deleteWorkflow, listWorkflows, saveWorkflow } from "../../storage/workflowRepository";

type Props = { copied: string; onCopy: (value: string, id: string) => void };

export function WorkflowBuilder({ copied, onCopy }: Props) {
  const [workflows, setWorkflows] = useState<PiecsWorkflow[]>([]);
  const [steps, setSteps] = useState<WorkflowBuilderStep[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("analyze");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const available = useMemo(() => searchCommands(query), [query]);
  const prompt = buildWorkflowPrompt(steps);

  const refresh = async () => setWorkflows(await listWorkflows());
  useEffect(() => {
    let active = true;
    listWorkflows().then((items) => { if (active) setWorkflows(items); })
      .catch(() => { if (active) setError("Không thể đọc Workflow Library từ IndexedDB."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const resetEditor = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setSteps([]);
    setError("");
  };

  const loadStarter = (starter: (typeof starterWorkflows)[number]) => {
    setEditingId(null);
    setName(starter.name);
    setDescription(starter.description);
    setSteps(starter.steps.map((step) => ({
      id: crypto.randomUUID(),
      commandId: step.commandId,
      parameters: { ...step.parameters },
      argumentsText: typeof step.parameters.raw === "string" ? step.parameters.raw : "",
    })));
    setError("");
  };

  const duplicate = async (id: string) => {
    try {
      await cloneWorkflow(id, `WORKFLOW-${crypto.randomUUID()}`);
      await refresh();
      setError("");
    } catch {
      setError("Không thể nhân bản workflow. Vui lòng thử lại.");
    }
  };

  const addStep = () => {
    if (!selectedCommand) return;
    setSteps((current) => [...current, {
      id: crypto.randomUUID(),
      commandId: selectedCommand,
      parameters: {},
      argumentsText: "",
    }]);
  };

  const save = async () => {
    setError("");
    if (!name.trim()) { setError("Vui lòng nhập tên workflow."); return; }
    if (steps.length === 0) { setError("Workflow cần có ít nhất một bước."); return; }
    const issues = validateWorkflowCommandIds(steps, new Set(commandCatalog.map((command) => command.id)));
    if (issues.length) { setError(issues.join(" ")); return; }
    const now = new Date().toISOString();
    const workflow: PiecsWorkflow = {
      id: editingId ?? `WORKFLOW-${crypto.randomUUID()}`,
      name: name.trim(),
      description: description.trim(),
      steps: steps.map(({ id, commandId, argumentsText }) => ({
        id, commandId, parameters: { raw: argumentsText.trim() },
      })),
      version: "1.0.0",
      schemaVersion: PIECS_SCHEMA_VERSION,
      createdAt: workflows.find((item) => item.id === editingId)?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await saveWorkflow(workflow);
      await refresh();
      resetEditor();
    } catch {
      setError("Không thể lưu workflow. Vui lòng thử lại.");
    }
  };

  const edit = (workflow: PiecsWorkflow) => {
    setEditingId(workflow.id);
    setName(workflow.name);
    setDescription(workflow.description);
    setSteps(workflow.steps.map((step) => ({
      ...step,
      argumentsText: typeof step.parameters.raw === "string" ? step.parameters.raw : "",
    })));
    setError("");
  };

  const remove = async (id: string) => {
    if (!window.confirm("Xóa workflow này? Hành động không thể hoàn tác.")) return;
    try {
      await deleteWorkflow(id);
      await refresh();
      if (editingId === id) resetEditor();
    } catch {
      setError("Không thể xóa workflow.");
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-300"><WorkflowIcon size={14}/> WORKFLOW DESIGNER</div><h2 className="text-xl font-semibold">Build reusable command workflows</h2><p className="mt-1 text-sm text-slate-400">Kết hợp các PIECS command thành quy trình có thể lưu và tái sử dụng.</p></div>
        <button type="button" onClick={resetEditor} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:bg-white/5"><Plus size={14}/> New workflow</button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">{error}</div>}
      <section className="space-y-3">
        <div className="flex items-center gap-2"><BookOpen size={15} className="text-indigo-300"/><h3 className="text-sm font-semibold">Starter workflows</h3><span className="text-xs text-slate-500">Load a preset and customize it</span></div>
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
          {starterWorkflows.map((starter) => (
            <article key={starter.id} className="flex flex-col rounded-xl border border-line bg-panel/50 p-3">
              <h4 className="text-xs font-semibold text-slate-200">{starter.name}</h4>
              <p className="mt-2 flex-1 text-[11px] leading-5 text-slate-500">{starter.description}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-600">{starter.steps.length} steps</span>
                <button type="button" onClick={() => loadStarter(starter)} className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] text-indigo-200 hover:bg-indigo-400/10">Use preset</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{editingId ? "Edit workflow" : "New workflow"}</h3><span className="text-xs text-slate-500">{steps.length} steps</span></div>
            <div className="mt-4 grid gap-3">
              <label className="text-xs text-slate-400">Workflow name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="e.g. Product photo preparation" className="mt-2 h-11 w-full rounded-xl border border-line bg-[#090d16] px-3 text-sm text-slate-100 outline-none focus:border-indigo-400/60"/></label>
              <label className="text-xs text-slate-400">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={500} placeholder="Describe the intended result..." className="mt-2 w-full rounded-xl border border-line bg-[#090d16] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400/60"/></label>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <input aria-label="Search workflow commands" value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setSelectedCommand(searchCommands(value)[0]?.id ?? ""); }} placeholder="Search commands..." className="h-11 min-w-0 rounded-xl border border-line bg-[#090d16] px-3 text-sm outline-none focus:border-indigo-400/60"/>
                <select aria-label="Choose workflow command" value={selectedCommand} onChange={(event) => setSelectedCommand(event.target.value)} className="h-11 min-w-0 rounded-xl border border-line bg-[#090d16] px-3 text-sm outline-none focus:border-indigo-400/60">
                  {available.map((command) => <option key={command.id} value={command.id}>/{command.id} · {command.module}</option>)}
                </select>
              </div>
              <button type="button" onClick={addStep} disabled={!selectedCommand} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"><Plus size={15}/> Add step</button>
            </div>
          </div>
          {steps.length === 0 ? <div className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-sm text-slate-500">Chưa có bước nào. Chọn command và nhấn Add step để bắt đầu.</div> :
            <ol className="space-y-3">{steps.map((step, index) => {
              const command = commandCatalog.find((item) => item.id === step.commandId);
              return <li key={step.id} className="rounded-2xl border border-line bg-panel/70 p-4">
                <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-400/10 text-xs font-semibold text-indigo-200">{index + 1}</span><div className="min-w-0"><h4 className="font-mono text-sm font-semibold">/{step.commandId}</h4><p className="text-xs text-slate-500">{command?.module} · {command?.name}</p></div></div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => setSteps((current) => moveWorkflowStep(current, index, -1))} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 disabled:opacity-25"><ArrowUp size={15}/></button>
                    <button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => setSteps((current) => moveWorkflowStep(current, index, 1))} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 disabled:opacity-25"><ArrowDown size={15}/></button>
                    <button type="button" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} className="rounded-lg p-2 text-rose-300 hover:bg-rose-400/10"><Trash2 size={15}/></button>
                  </div>
                </div>
                <label className="mt-4 block text-xs text-slate-400">Arguments <span className="text-slate-600">(optional, free-form)</span><textarea aria-label={`Arguments for step ${index + 1} (${step.commandId})`} value={step.argumentsText} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, argumentsText: event.target.value } : item))} rows={2} placeholder="scope=full · target=main-subject" className="mt-2 w-full rounded-xl border border-line bg-[#090d16] px-3 py-2.5 font-mono text-xs text-slate-200 outline-none focus:border-indigo-400/60"/></label>
              </li>;
            })}</ol>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={resetEditor} className="rounded-xl border border-line px-4 py-2.5 text-xs text-slate-300">Cancel</button><button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-xs font-semibold text-slate-950"><Save size={14}/> Save workflow</button></div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel/70 p-4 sm:sticky sm:top-[92px] sm:p-5">
            <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold">Workflow preview</h3><p className="mt-1 text-xs text-slate-500">Generated prompt · {steps.length} commands</p></div><button type="button" onClick={() => onCopy(prompt, "workflow-builder")} disabled={!prompt} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-300 disabled:opacity-40"><Copy size={13}/>{copied === "workflow-builder" ? "Copied" : "Copy"}</button></div>
            <pre aria-label="Generated workflow prompt" className="mt-4 min-h-40 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-[#090d16] p-4 font-mono text-xs leading-6 text-emerald-200">{prompt || "Các command sẽ xuất hiện tại đây theo thứ tự workflow."}</pre>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-5 text-slate-500">PIECS lưu workflow và tạo prompt văn bản. Không thực thi command hoặc gửi dữ liệu đến AI provider.</p>
          </div>
          <div className="rounded-2xl border border-line bg-panel/50 p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Saved workflows</h3><span className="text-xs text-slate-500">{workflows.length}</span></div>
            {loading ? <p className="text-xs text-slate-500">Loading workflows...</p> : workflows.length === 0 ? <p className="text-xs text-slate-500">Chưa có workflow nào được lưu.</p> :
              <ul className="space-y-2">{workflows.map((workflow) => <li key={workflow.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-[#090d16]/70 p-3"><button type="button" onClick={() => edit(workflow)} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium text-slate-200">{workflow.name}</span><span className="mt-1 block text-[10px] text-slate-500">{workflow.steps.length} steps · Updated {new Date(workflow.updatedAt).toLocaleDateString()}</span></button><button type="button" aria-label={`Duplicate ${workflow.name}`} onClick={() => duplicate(workflow.id)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><Copy size={14}/></button><button type="button" aria-label={`Delete ${workflow.name}`} onClick={() => remove(workflow.id)} className="rounded-lg p-2 text-rose-300 hover:bg-rose-400/10"><Trash2 size={14}/></button></li>)}</ul>}
          </div>
        </aside>
      </div>
    </section>
  );
}
