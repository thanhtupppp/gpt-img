import {useState,type ReactNode} from "react";
import {Activity, Command, FileJson, Grid2X2, Heart, Image as ImageIcon, Layers3, Menu, Settings, Sparkles, Workflow, X} from "lucide-react";

export type AppPage = "Overview" | "Template Library" | "Workflows" | "AI Workflow Engine" | "Command Library" | "JSON Studio" | "Favorites" | "Settings";
const navigation = [
  {label:"Overview" as const, icon:Grid2X2},
  {label:"Template Library" as const, icon:ImageIcon},
  {label:"Workflows" as const, icon:Workflow},
  {label:"AI Workflow Engine" as const, icon:Activity},
  {label:"Command Library" as const, icon:Command},
  {label:"JSON Studio" as const, icon:FileJson},
  {label:"Favorites" as const, icon:Heart},
];

type AppShellProps = {page:AppPage; onNavigate:(page:AppPage)=>void; favoriteCount:number; children:ReactNode};
export function AppShell({page,onNavigate,favoriteCount,children}:AppShellProps) {
  const [mobileOpen,setMobileOpen] = useState(false);
  const navigate = (next:AppPage) => {onNavigate(next);setMobileOpen(false);};
  return <div className="min-h-screen text-slate-100 lg:flex">\n    <a href="#main-content" className="sr-only z-50 rounded-lg bg-indigo-400 px-4 py-3 font-semibold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
    {mobileOpen && <button aria-label="Close navigation overlay" onClick={()=>setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/65 backdrop-blur-sm lg:hidden"/>}
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[min(18rem,86vw)] flex-col border-r border-line bg-[#0c1220] p-5 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 ${mobileOpen?"translate-x-0":"-translate-x-full"}`}>
      <div className="mb-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-400/15 text-indigo-300"><Layers3 size={21}/></div><div><div className="font-bold tracking-wide">PIECS <span className="text-indigo-300">Library</span></div><div className="text-[10px] uppercase tracking-[.22em] text-slate-500">Image editing system</div></div></div>
        <button aria-label="Close menu" onClick={()=>setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 lg:hidden"><X size={18}/></button>
      </div>
      <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-600">Workspace</div>
      <nav aria-label="Main navigation" className="space-y-1">{navigation.map(item=>{const Icon=item.icon;return <button key={item.label} aria-current={page===item.label?"page":undefined} onClick={()=>navigate(item.label)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${page===item.label?"bg-indigo-400/10 text-indigo-200":"text-slate-400 hover:bg-white/[.04] hover:text-white"}`}><Icon size={17}/><span>{item.label}</span>{item.label==="Favorites"&&<span className="ml-auto text-xs text-slate-500">{favoriteCount}</span>}</button>})}</nav>
      <div className="mb-3 mt-9 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-600">System</div>
      <button onClick={()=>navigate("Settings")} aria-current={page==="Settings"?"page":undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${page==="Settings"?"bg-indigo-400/10 text-indigo-200":"text-slate-400 hover:bg-white/[.04]"}`}><Settings size={17}/>Settings</button>
      <div className="mt-auto rounded-2xl border border-indigo-300/15 bg-indigo-400/[.06] p-4"><div className="mb-2 flex items-center gap-2 text-indigo-200"><Sparkles size={15}/><span className="text-xs font-semibold">PIECS MASTER</span></div><p className="text-xs leading-5 text-slate-400">80 commands · 8 modules · Provider-neutral workflow.</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-full rounded-full bg-indigo-400"/></div><div className="mt-2 text-[10px] text-slate-500">Specification v1.0.0</div></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-line/80 bg-[#090d16]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-9">
        <div className="flex items-center gap-3"><button aria-label="Open navigation menu" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 lg:hidden"><Menu size={19}/></button><div className="hidden text-xs text-slate-500 sm:block">Workspace <span className="px-2">/</span><span className="text-slate-200">{page}</span></div><div className="text-sm font-semibold sm:hidden">PIECS Library</div></div>
        <div className="flex items-center gap-3"><span className="hidden rounded-full border border-line px-3 py-1.5 text-[11px] text-slate-400 md:block">MASTER EDITION <span className="ml-1 text-indigo-300">1.0</span></span><div aria-label="User profile" className="grid h-8 w-8 place-items-center rounded-full border border-indigo-300/30 bg-indigo-400/10 text-xs font-bold text-indigo-200">TT</div></div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-[calc(100vh-72px)] max-w-[1500px] px-4 py-7 sm:px-6 md:py-9 lg:px-9">{children}</main>
    </div>
  </div>;
}
