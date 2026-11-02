import {useMemo,useState} from "react";
import {Check,Command,Copy,Search,Tag} from "lucide-react";
import {commandModules} from "../../data/commands";
import {commandCatalog,searchCommands,type CommandCatalogEntry} from "../../data/commandCatalog";
import { CommandBuilder } from "./CommandBuilder";

type Props={copied:string;onCopy:(value:string,id:string)=>void};
export function CommandLibrary({copied,onCopy}:Props){
  const [activeTab,setActiveTab]=useState<"library"|"builder">("library");
  const [query,setQuery]=useState("");
  const [moduleFilter,setModuleFilter]=useState("All");
  const [selectedId,setSelectedId]=useState("analyze");
  const filtered=useMemo(()=>searchCommands(query).filter(command=>moduleFilter==="All"||command.module===moduleFilter),[query,moduleFilter]);
  const selected=filtered.find(command=>command.id===selectedId)??filtered[0];
  const chooseModule=(value:string)=>{setModuleFilter(value);const next=searchCommands(query).filter(command=>value==="All"||command.module===value);setSelectedId(next[0]?.id??"");};
  return <section className="space-y-5">
    <div className="flex gap-2 border-b border-line pb-3" role="tablist" aria-label="Command tools">
      <button type="button" role="tab" aria-selected={activeTab==="library"} onClick={()=>setActiveTab("library")} className={`rounded-lg px-4 py-2 text-sm ${activeTab==="library"?"bg-indigo-400/15 text-indigo-200":"text-slate-400 hover:bg-white/5"}`}>Command Library</button>
      <button type="button" role="tab" aria-selected={activeTab==="builder"} onClick={()=>setActiveTab("builder")} className={`rounded-lg px-4 py-2 text-sm ${activeTab==="builder"?"bg-indigo-400/15 text-indigo-200":"text-slate-400 hover:bg-white/5"}`}>Command Builder</button>
    </div>
    {activeTab==="builder" ? <CommandBuilder copied={copied} onCopy={onCopy}/> : <>
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={17}/><input aria-label="Search commands" value={query} onChange={event=>{setQuery(event.target.value);const next=searchCommands(event.target.value).filter(command=>moduleFilter==="All"||command.module===moduleFilter);setSelectedId(next[0]?.id??"");}} placeholder="Search command, description, module, or tag..." className="h-12 w-full rounded-xl border border-line bg-panel/80 pl-11 pr-4 text-sm outline-none placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/15"/></div>
      <select aria-label="Filter commands by module" value={moduleFilter} onChange={event=>chooseModule(event.target.value)} className="h-12 rounded-xl border border-line bg-panel px-4 text-sm text-slate-300 outline-none focus:border-indigo-400/60"><option value="All">All modules · 80</option>{commandModules.map(module=><option key={module.name} value={module.name}>{module.name} · {module.commands.length}</option>)}</select>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.85fr)]">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Command catalog</h2><span className="text-xs text-slate-500">{filtered.length} / {commandCatalog.length} commands</span></div>
        {filtered.length===0?<div className="rounded-2xl border border-dashed border-line px-5 py-12 text-center text-sm text-slate-500">No commands match this search.</div>:<div className="grid gap-3 sm:grid-cols-2">{filtered.map(command=><CommandItem key={command.id} command={command} active={selected?.id===command.id} copied={copied===command.id} onSelect={()=>setSelectedId(command.id)} onCopy={()=>onCopy(command.syntax,command.id)}/>)}</div>}
      </div>
      <aside className="min-w-0">
        {selected?<CommandDetail command={selected} copied={copied===selected.id} onCopy={()=>onCopy(selected.syntax,selected.id)}/>:<div className="rounded-2xl border border-line bg-panel/50 p-6 text-sm text-slate-500">Select a command to inspect its specification.</div>}
      </aside>
    </div>
    </>}
  </section>;
}
function CommandItem({command,active,copied,onSelect,onCopy}:{command:CommandCatalogEntry;active:boolean;copied:boolean;onSelect:()=>void;onCopy:()=>void}){
  return <article className={`rounded-xl border p-4 transition ${active?"border-indigo-300/50 bg-indigo-400/[.07]":"border-line bg-panel/50 hover:border-slate-600"}`}>
    <div className="flex items-start justify-between gap-2"><button type="button" onClick={onSelect} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"><div className="font-mono text-sm font-semibold text-slate-100">/{command.id}</div><div className="mt-1 text-[11px] text-indigo-300">{command.module}</div></button><button type="button" aria-label={`Copy ${command.id} syntax`} onClick={onCopy} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">{copied?<Check size={14} className="text-emerald-300"/>:<Copy size={14}/>}</button></div>
    <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{command.description}</p>
    <button type="button" onClick={onSelect} className="mt-3 text-[11px] font-medium text-indigo-300 hover:text-indigo-200">View specification →</button>
  </article>;
}
function CommandDetail({command,copied,onCopy}:{command:CommandCatalogEntry;copied:boolean;onCopy:()=>void}){
  return <div className="sticky top-[92px] space-y-5 rounded-2xl border border-line bg-panel/80 p-5 sm:p-6">
    <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-indigo-300"><Command size={13}/>{command.module} module</div><h2 className="text-xl font-semibold">{command.name}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{command.description}</p></div>
    <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Syntax</div><div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-[#090d16] p-3"><code className="min-w-0 break-all text-xs text-emerald-200">{command.syntax}</code><button type="button" onClick={onCopy} aria-label="Copy command syntax" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">{copied?<Check size={14} className="text-emerald-300"/>:<Copy size={14}/>}</button></div></div>
    <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Example</div><pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-[#090d16] p-3 text-xs leading-5 text-slate-300">{command.examples[0]}</pre></div>
    <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500"><Tag size={12}/> Tags</div><div className="flex flex-wrap gap-2">{command.tags.map(tag=><span key={tag} className="rounded-full border border-line px-2.5 py-1 text-[10px] text-slate-400">{tag}</span>)}</div></div>
    <p className="border-t border-line pt-4 text-[11px] leading-5 text-slate-500">PIECS command specification · Provider-neutral · Documentation only; no AI execution is performed.</p>
  </div>;
}
