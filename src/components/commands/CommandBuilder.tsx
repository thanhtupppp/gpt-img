import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { commandCatalog, searchCommands } from "../../data/commandCatalog";
import { buildCommandPrompt, moveCommandStep, type CommandBuilderStep } from "../../features/commands/commandBuilder";

type Props = { copied: string; onCopy: (value: string, id: string) => void };

export function CommandBuilder({ copied, onCopy }: Props) {
  const [query, setQuery] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("analyze");
  const [steps, setSteps] = useState<CommandBuilderStep[]>([]);
  const available = useMemo(() => searchCommands(query), [query]);
  const prompt = buildCommandPrompt(steps);

  const addStep = () => {
    if (!selectedCommand) return;
    setSteps((current) => [...current, {
      id: `step-${Date.now()}-${current.length}`,
      commandId: selectedCommand,
      argumentsText: "",
    }]);
  };

  const updateArguments = (id: string, argumentsText: string) => {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, argumentsText } : step));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((current) => moveCommandStep(current, index, direction));
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-panel/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">Build a command sequence</h2><p className="mt-1 text-xs text-slate-400">Chọn lệnh, thêm vào quy trình và sắp xếp thứ tự thực thi.</p></div>
            <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-400">{steps.length} steps</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
              <input aria-label="Search builder commands" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands..." className="h-11 min-w-0 rounded-xl border border-line bg-[#090d16] px-3 text-sm outline-none focus:border-indigo-400/60"/>
              <select aria-label="Choose command to add" value={selectedCommand} onChange={(event) => setSelectedCommand(event.target.value)} className="h-11 min-w-0 rounded-xl border border-line bg-[#090d16] px-3 text-sm outline-none focus:border-indigo-400/60">
                {available.map((command) => <option key={command.id} value={command.id}>/{command.id} · {command.module}</option>)}
                {!available.some((command) => command.id === selectedCommand) && <option value={selectedCommand}>/{selectedCommand}</option>}
              </select>
            </div>
            <button type="button" onClick={addStep} disabled={!selectedCommand} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={16}/> Add command</button>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-12 text-center">
            <p className="text-sm text-slate-300">Chưa có lệnh nào trong Command Builder.</p>
            <p className="mt-2 text-xs text-slate-500">Chọn một lệnh ở trên rồi nhấn Add command để bắt đầu.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {steps.map((step, index) => {
              const command = commandCatalog.find((item) => item.id === step.commandId);
              return (
                <li key={step.id} className="rounded-2xl border border-line bg-panel/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-400/10 text-xs font-semibold text-indigo-200">{index + 1}</span>
                      <div className="min-w-0"><h3 className="truncate font-mono text-sm font-semibold">/{step.commandId}</h3><p className="mt-1 text-xs text-slate-500">{command?.module} · {command?.name}</p></div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label={`Move ${step.commandId} up`} disabled={index === 0} onClick={() => moveStep(index, -1)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 disabled:opacity-25"><ArrowUp size={15}/></button>
                      <button type="button" aria-label={`Move ${step.commandId} down`} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 disabled:opacity-25"><ArrowDown size={15}/></button>
                      <button type="button" aria-label={`Remove ${step.commandId}`} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} className="rounded-lg p-2 text-rose-300 hover:bg-rose-400/10"><Trash2 size={15}/></button>
                    </div>
                  </div>
                  <label className="mt-4 block text-xs font-medium text-slate-400" htmlFor={`args-${step.id}`}>Arguments <span className="font-normal text-slate-600">(optional, free-form)</span></label>
                  <textarea id={`args-${step.id}`} value={step.argumentsText} onChange={(event) => updateArguments(step.id, event.target.value)} rows={2} placeholder="scope=full · target=main-subject" className="mt-2 w-full resize-y rounded-xl border border-line bg-[#090d16] px-3 py-2.5 font-mono text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/60"/>
                  {command?.examples[0] && <p className="mt-2 break-all text-[11px] text-slate-600">Example: {command.examples[0]}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <aside className="min-w-0 space-y-3">
        <div className="rounded-2xl border border-line bg-panel/70 p-4 sm:sticky sm:top-[92px] sm:p-5">
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Generated prompt</h2><p className="mt-1 text-xs text-slate-500">Live preview · {steps.length} commands</p></div><button type="button" onClick={() => onCopy(prompt, "command-builder")} disabled={!prompt} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"><Copy size={13}/>{copied === "command-builder" ? "Copied" : "Copy"}</button></div>
          <pre aria-label="Generated command prompt" className="mt-4 min-h-48 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-[#090d16] p-4 font-mono text-xs leading-6 text-emerald-200">{prompt || "Các lệnh sẽ xuất hiện ở đây theo đúng thứ tự anh sắp xếp."}</pre>
          <div className="mt-3 flex justify-end"><button type="button" onClick={() => setSteps([])} disabled={steps.length === 0} className="text-xs text-slate-500 hover:text-rose-300 disabled:opacity-30">Clear sequence</button></div>
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-5 text-slate-500">PIECS chỉ tạo chuỗi prompt văn bản. Chưa thực thi lệnh hoặc gửi dữ liệu đến AI provider.</p>
        </div>
      </aside>
    </section>
  );
}
