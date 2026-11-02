import {useEffect,useMemo,useState} from "react";
import {ChevronDown,Command,Copy,Download,Grid2X2,Image as ImageIcon,Plus,Search,SlidersHorizontal,Sparkles,Upload,Workflow,Trash2,Edit3} from "lucide-react";
import {templates,categories} from "./data/templates";
import type {Category,Template} from "./types";
import {initializeTemplateLibrary} from "./storage/seed";
import {cloneTemplate,deleteCustomTemplate,importCustomTemplates,listFavoriteIds,listTemplates,saveCustomTemplate,setFavorite} from "./storage/templateRepository";
import {exportTemplates,parseTemplateImport} from "./storage/templateTransfer";
import type {PiecsTemplate} from "./domain/types";
import {TemplateEditor} from "./components/templates/TemplateEditor";
import {AppShell,type AppPage} from "./components/layout/AppShell";
import {StatCard} from "./components/ui/StatCard";
import {TemplateCard} from "./components/templates/TemplateCard";
import {TemplateDetail} from "./components/templates/TemplateDetail";
import {CommandLibrary} from "./components/commands/CommandLibrary";

const pageCopy:Record<AppPage,{title:string;description:string}> = {
  "Overview":{title:"Creative workspace",description:"Your PIECS workspace at a glance."},
  "Template Library":{title:"Template Library",description:"Khám phá, tìm kiếm và tái sử dụng các preset chỉnh sửa ảnh AI theo chuẩn PIECS."},
  "Workflows":{title:"Workflow Library",description:"Quản lý các quy trình chỉnh sửa nhiều bước theo chuẩn PIECS."},
  "Command Library":{title:"Command Library",description:"Explore the 80 standardized PIECS commands across eight functional modules."},
  "Favorites":{title:"Your Favorites",description:"Các template anh đã lưu để truy cập nhanh."},
  "Settings":{title:"Settings",description:"Thông tin và tùy chọn của PIECS Library."},
};

export default function App(){
  const [page,setPage]=useState<AppPage>("Template Library");
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState<Category>("All");
  const [profile,setProfile]=useState("All profiles");
  const [selected,setSelected]=useState<Template|null>(null);
  const [library,setLibrary]=useState<PiecsTemplate[]>([]);
  const [editorOpen,setEditorOpen]=useState(false);
  const [editing,setEditing]=useState<PiecsTemplate|undefined>();
  const [favorites,setFavorites]=useState<string[]>([]);
  const [storageError,setStorageError]=useState("");
  useEffect(()=>{
    let active=true;
    initializeTemplateLibrary(templates).then(()=>Promise.all([listFavoriteIds(),listTemplates()])).then(([ids,items])=>{if(active){setFavorites(ids);setLibrary(items);}}).catch(()=>{if(active)setStorageError("Không thể mở bộ nhớ cục bộ. Hãy kiểm tra chế độ riêng tư hoặc quyền lưu trữ của trình duyệt.");});
    return ()=>{active=false;};
  },[]);
  const [copied,setCopied]=useState("");
  const refreshLibrary=async()=>{setLibrary(await listTemplates());};
  const toggleFavorite=(id:string)=>{
    const next=!favorites.includes(id);
    setFavorite(id,next).then(()=>setFavorites(current=>next?[...current.filter(item=>item!==id),id]:current.filter(item=>item!==id))).catch(()=>setStorageError("Không thể lưu thay đổi yêu thích vào bộ nhớ cục bộ."));
  };
  const copy=async(value:string,id:string)=>{
    try { await navigator.clipboard.writeText(value); setCopied(id); window.setTimeout(()=>setCopied(""),1400); }
    catch { setCopied("copy-error"); window.setTimeout(()=>setCopied(""),1800); }
  };
  const visible=useMemo(()=>library.map(item=>({
    id:item.id,name:item.name,description:item.description,category:item.category as Template["category"],profile:item.profile,
    commands:item.commandIds.map(command=>"/"+command),tags:item.tags,gradient:"from-indigo-300/25 via-violet-500/10 to-slate-950",popular:false
  })).filter(t=>
    (category==="All"||t.category===category)&&
    (profile==="All profiles"||t.profile===profile)&&
    [t.name,t.description,t.id,...t.tags,...t.commands].join(" ").toLowerCase().includes(query.trim().toLowerCase())&&
    (page!=="Favorites"||favorites.includes(t.id))
  ),[library,category,profile,query,page,favorites]);

  return <AppShell page={page} onNavigate={next=>{setPage(next);setSelected(null);}} favoriteCount={favorites.length}>
    {editorOpen&&<TemplateEditor initial={editing} onCancel={()=>setEditorOpen(false)} onSave={async item=>{await saveCustomTemplate(item);await refreshLibrary();setEditorOpen(false);setEditing(undefined);}}/>}
    {selected ? <TemplateDetail template={selected} onBack={()=>setSelected(null)} onCopy={copy} copied={copied} favorite={favorites.includes(selected.id)} onFavorite={()=>toggleFavorite(selected.id)}/> :
    <div className="space-y-7">
      {storageError&&<div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">{storageError}</div>}
      <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-medium text-indigo-300"><Sparkles size={14}/> PROFESSIONAL IMAGE EDITING COMMAND SYSTEM</div><h1 className="text-3xl font-semibold tracking-tight md:text-[40px]">{pageCopy[page].title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{pageCopy[page].description}</p></div>
        {page==="Template Library"&&<div className="flex flex-wrap gap-2 self-start"><button type="button" onClick={()=>{setEditing(undefined);setEditorOpen(true);}} className="inline-flex items-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-sm font-semibold text-slate-950"><Plus size={16}/> New template</button><button type="button" onClick={()=>{const blob=new Blob([exportTemplates(library.filter(item=>item.origin==="custom"))],{type:"application/json"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download="piecs-templates.json";anchor.click();URL.revokeObjectURL(url);}} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs text-slate-300"><Download size={14}/> Export</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs text-slate-300"><Upload size={14}/> Import<input type="file" accept="application/json,.json" className="hidden" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;try{const imported=parseTemplateImport(await file.text());const duplicate=imported.find(item=>library.some(existing=>existing.id===item.id));if(duplicate)throw new Error(`ID ${duplicate.id} đã tồn tại. Không ghi đè template hiện có.`);await importCustomTemplates(imported);await refreshLibrary();setStorageError("");}catch(error){setStorageError(error instanceof Error?error.message:"Không thể nhập file.");}finally{event.target.value="";}}}/></label></div>}
      </header>

      {page==="Settings" ? <section className="max-w-2xl rounded-2xl border border-line bg-panel p-6"><h2 className="font-semibold">Library preferences</h2><p className="mt-2 text-sm leading-6 text-slate-400">Dữ liệu thư viện và danh sách yêu thích được lưu cục bộ bằng IndexedDB trên thiết bị này. Anh có thể tạo, sửa, xóa template cá nhân và xuất/nhập JSON để sao lưu thủ công; không có tài khoản hoặc đồng bộ cloud.</p><div className="mt-5 rounded-xl bg-slate-900 p-4 text-xs text-slate-400">PIECS Core · schema v1.0.0 · Master profile · 80 registered commands</div></section> :
      page==="Command Library" ? <CommandLibrary copied={copied} onCopy={copy}/> :
      page==="Workflows" ? <EmptyFeature icon={Workflow} title="Workflow Builder" description="Workflow Builder, các bước tuần tự và bộ workflow mẫu sẽ được triển khai trong P3."/> :
      page==="Overview" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><StatCard icon={ImageIcon} label="Templates" value={String(library.length).padStart(2,"0")} note="Curated starter presets"/><StatCard icon={Command} label="Commands" value="80" note="Across 8 modules"/><StatCard icon={Workflow} label="Workflows" value="05" note="Planned reference pipelines"/></div> :
      <>
        {page==="Template Library"&&<div className="grid gap-3 sm:grid-cols-3"><StatCard icon={ImageIcon} label="Templates" value={String(templates.length).padStart(2,"0")} note="Curated starter presets"/><StatCard icon={Command} label="Commands" value="80" note="Across 8 modules"/><StatCard icon={Workflow} label="Workflows" value="05" note="Reference pipelines"/></div>}
        <section aria-label="Template filters" className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row"><div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={17}/><input aria-label="Search templates" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search templates, commands, tags..." className="h-12 w-full rounded-xl border border-line bg-panel/80 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/15"/></div><div className="flex gap-2"><label className="relative min-w-0 flex-1 sm:flex-none"><span className="sr-only">Filter by profile</span><SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15}/><select aria-label="Filter by profile" value={profile} onChange={e=>setProfile(e.target.value)} className="h-12 w-full appearance-none rounded-xl border border-line bg-panel pl-9 pr-9 text-xs text-slate-300 outline-none focus:border-indigo-400/60"><option>All profiles</option><option>Professional</option><option>Studio</option><option>Master</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" size={13}/></label><button type="button" onClick={()=>{setQuery("");setProfile("All profiles");setCategory("All");}} className="rounded-xl border border-line px-4 text-xs text-slate-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Reset</button></div></div>
          <div aria-label="Filter by category" className="scrollbar flex gap-2 overflow-x-auto pb-2">{categories.map(c=><button type="button" key={c} aria-pressed={category===c} onClick={()=>setCategory(c)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${category===c?"bg-indigo-400 text-slate-950":"border border-line bg-panel/60 text-slate-400 hover:text-white"}`}>{c}</button>)}</div>
        </section>
        <div className="flex items-center justify-between"><div className="text-sm font-medium">{visible.length} templates <span className="ml-1 text-xs font-normal text-slate-500">· {page==="Favorites"?"Saved items":"Curated library"}</span></div><div className="flex items-center gap-2 text-xs text-slate-500"><Grid2X2 size={14}/> Grid view</div></div>
        {visible.length>0?<div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visible.map(t=><div key={t.id}><TemplateCard template={t} onOpen={()=>setSelected(t)} favorite={favorites.includes(t.id)} onFavorite={()=>toggleFavorite(t.id)}/>{library.find(item=>item.id===t.id)?.origin==="custom"?<div className="mt-2 flex justify-end gap-2"><button type="button" onClick={()=>{setEditing(library.find(item=>item.id===t.id));setEditorOpen(true);}} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[11px] text-slate-300"><Edit3 size={12}/> Edit</button><button type="button" onClick={async()=>{if(window.confirm("Xóa template cá nhân này? Hành động này không thể hoàn tác.")){try{await deleteCustomTemplate(t.id);await refreshLibrary();setFavorites(await listFavoriteIds());}catch(error){setStorageError(error instanceof Error?error.message:"Không thể xóa template.");}}}} className="inline-flex items-center gap-1 rounded-lg border border-rose-400/20 px-3 py-1.5 text-[11px] text-rose-300"><Trash2 size={12}/> Delete</button></div>:<div className="mt-2 flex justify-end"><button type="button" onClick={async()=>{try{await cloneTemplate(t.id,`CUSTOM-${crypto.randomUUID()}`);await refreshLibrary();setStorageError("");}catch(error){setStorageError(error instanceof Error?error.message:"Không thể sao chép template.");}}} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[11px] text-slate-300"><Copy size={12}/> Clone to custom</button></div>}</div>)}</div>:<div className="rounded-2xl border border-dashed border-line py-16 text-center"><Search className="mx-auto mb-3 text-slate-600"/><p className="text-sm text-slate-300">{page==="Favorites"?"Anh chưa lưu template nào.":"Không tìm thấy template phù hợp."}</p><button type="button" onClick={()=>{setQuery("");setCategory("All");setProfile("All profiles");}} className="mt-3 text-xs text-indigo-300">Xóa bộ lọc</button></div>}
      </>}
    </div>}
  </AppShell>;
}

function EmptyFeature({icon:Icon,title,description}:{icon:typeof Workflow;title:string;description:string}){return <section className="rounded-2xl border border-dashed border-line bg-panel/30 px-5 py-16 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-400/10 text-indigo-300"><Icon size={22}/></div><h2 className="mt-4 font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">{description}</p></section>}
