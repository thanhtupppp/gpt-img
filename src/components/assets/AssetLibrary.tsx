import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Search, Trash2, Upload, X, Copy } from "lucide-react";
import { createAsset, deleteAsset, getAsset, listAssets, MAX_ASSET_SIZE_BYTES, type AssetMetadata } from "../../storage/assetRepository";

const sizeLabel = (size: number) => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(2)} MB`;

export function AssetLibrary() {
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ asset: AssetMetadata; url: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetMetadata | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setAssets(await listAssets());
  useEffect(() => {
    let active = true;
    listAssets().then(items => { if (active) setAssets(items); })
      .catch(() => { if (active) setError("Không thể đọc Asset Library từ IndexedDB."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      if (file.size > MAX_ASSET_SIZE_BYTES) throw new Error("Ảnh vượt giới hạn 25 MB.");
      setBusy(true);
      await createAsset({ name: file.name, blob: file, source: "upload" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải ảnh lên.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openPreview = async (asset: AssetMetadata) => {
    setError("");
    try {
      const stored = await getAsset(asset.id);
      if (!stored) throw new Error("Ảnh không còn tồn tại trong bộ nhớ.");
      setPreview({ asset, url: URL.createObjectURL(stored.blob) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể mở ảnh.");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget.id);
      if (preview?.asset.id === deleteTarget.id) setPreview(null);
      setDeleteTarget(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xóa ảnh.");
    }
  };

  const visible = assets.filter(asset =>
    [asset.name, asset.mimeType, asset.source, asset.graphId ?? "", asset.nodeId ?? ""]
      .join(" ").toLowerCase().includes(query.trim().toLowerCase()));

  return <section className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-300"><ImageIcon size={14}/> P10 · LOCAL ASSET STORAGE</div><h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Asset Library</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Quản lý ảnh đầu vào và ảnh được tạo từ workflow. Ảnh được lưu cục bộ trên thiết bị này.</p></div>
      <div><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload image asset" className="hidden" onChange={event => void upload(event.target.files?.[0])}/><button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"><Upload size={15}/>{busy ? "Uploading..." : "Upload image"}</button></div>
    </header>
    {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="relative min-w-0 flex-1 sm:max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input aria-label="Search assets" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, source, workflow..." className="h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-3 text-sm outline-none focus:border-indigo-400/60"/></label><span className="text-xs text-slate-500">{visible.length} / {assets.length} assets · IndexedDB · 25 MB/file</span></div>
    {loading ? <p className="rounded-xl border border-line p-8 text-center text-sm text-slate-500">Loading assets...</p> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-line px-5 py-16 text-center"><ImageIcon className="mx-auto mb-3 text-slate-600" size={28}/><p className="text-sm text-slate-300">{assets.length ? "Không tìm thấy ảnh phù hợp." : "Asset Library đang trống."}</p><p className="mt-2 text-xs text-slate-500">Tải PNG, JPEG hoặc WebP lên, hoặc tạo ảnh từ workflow.</p></div> :
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{visible.map(asset => <article key={asset.id} className="overflow-hidden rounded-2xl border border-line bg-panel/70">
        <button type="button" onClick={() => void openPreview(asset)} className="group grid aspect-[4/3] w-full place-items-center overflow-hidden bg-[#090d16] text-slate-500 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300"><ImageIcon size={34}/><span className="text-[10px]">Open full preview</span></button>
        <div className="space-y-3 p-3"><div className="min-w-0"><h3 className="truncate text-sm font-medium text-slate-200" title={asset.name}>{asset.name}</h3><p className="mt-1 text-[10px] text-slate-500">{sizeLabel(asset.size)} · {asset.mimeType}</p></div>
          <div className="flex items-center justify-between gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] ${asset.source === "workflow" ? "border-violet-300/20 bg-violet-400/10 text-violet-200" : "border-sky-300/20 bg-sky-400/10 text-sky-200"}`}>{asset.source === "workflow" ? "Workflow output" : "Upload"}</span><span className="text-[10px] text-slate-500">{new Date(asset.createdAt).toLocaleDateString()}</span></div>
          {asset.graphId && <p className="truncate text-[10px] text-slate-500" title={asset.graphId}>Graph: {asset.graphId} · Node: {asset.nodeId}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-2"><button type="button" onClick={() => void navigator.clipboard.writeText(asset.id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/5"><Copy size={12}/> Copy ID</button><button type="button" onClick={() => setDeleteTarget(asset)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-400/10"><Trash2 size={13}/> Delete</button></div>
        </div>
      </article>)}</div>}
    {preview && <div role="dialog" aria-modal="true" aria-label="Asset preview" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null); }}><div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-[#0c1220]"><div className="flex items-center justify-between gap-3 border-b border-line p-4"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{preview.asset.name}</h3><p className="mt-1 text-xs text-slate-500">{sizeLabel(preview.asset.size)} · {preview.asset.mimeType}</p></div><button type="button" aria-label="Close preview" onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><X size={18}/></button></div><div className="grid max-h-[75vh] place-items-center overflow-auto p-4"><img src={preview.url} alt={preview.asset.name} className="max-h-[68vh] max-w-full object-contain"/></div></div></div>}
    {deleteTarget && <div role="dialog" aria-modal="true" aria-labelledby="delete-asset-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"><div className="w-full max-w-sm rounded-2xl border border-line bg-[#0c1220] p-5"><h3 id="delete-asset-title" className="font-semibold">Delete asset?</h3><p className="mt-2 break-words text-sm text-slate-400">Xóa “{deleteTarget.name}” khỏi bộ nhớ cục bộ? Hành động này không thể hoàn tác.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl border border-line px-3 py-2 text-xs text-slate-300">Cancel</button><button type="button" onClick={() => void remove()} className="rounded-xl bg-rose-400 px-3 py-2 text-xs font-semibold text-slate-950">Delete permanently</button></div></div></div>}
  </section>;
}
