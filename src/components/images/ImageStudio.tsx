import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, ImagePlus, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import { generateGeminiImage, testGeminiConnection, type GeminiImageModel, type ImageAspectRatio } from "../../features/images/geminiImageApi";
import { getAsset, listAssets, type AssetMetadata } from "../../storage/assetRepository";

const models: { value: GeminiImageModel; label: string }[] = [
  { value: "gemini-nano-banana-2.1", label: "Nano Banana 2.1" },
  { value: "gemini-3.1-flash-image", label: "Nano Banana 2" },
  { value: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite" },
  { value: "gemini-3-pro-image", label: "Nano Banana Pro" },
];
const ratios: ImageAspectRatio[] = ["1:1", "4:5", "3:2", "2:3", "3:4", "9:16", "16:9", "21:9", "4:3", "5:4", "1:4", "1:8", "4:1", "8:1"];
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const supportedTypes = ["image/png", "image/jpeg", "image/webp"] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.includes(",")) return reject(new Error("Dữ liệu ảnh không hợp lệ."));
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<GeminiImageModel>("gemini-nano-banana-2.1");
  const [ratio, setRatio] = useState<ImageAspectRatio>("1:1");
  const [size, setSize] = useState<"1K" | "2K" | "4K">("1K");
  const [source, setSource] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultMime, setResultMime] = useState("image/png");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState<"unknown" | "ready" | "failed">("unknown");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetLoadingId, setAssetLoadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [sourcePreview, resultUrl]);

  const chooseFile = (file?: File) => {
    if (!file) return;
    setError("");
    if (!(supportedTypes as readonly string[]).includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("Ảnh đầu vào vượt quá 10 MB.");
      return;
    }
    setSource(file);
    setSourcePreview(URL.createObjectURL(file));
  };

  const openAssetPicker = async () => {
    setAssetPickerOpen(true);
    setAssetsLoading(true);
    setError("");
    try {
      setAssets(await listAssets());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải Asset Library.");
      setAssetPickerOpen(false);
    } finally {
      setAssetsLoading(false);
    }
  };

  const chooseSavedAsset = async (asset: AssetMetadata) => {
    setAssetLoadingId(asset.id);
    setError("");
    try {
      const stored = await getAsset(asset.id);
      if (!stored) throw new Error("Ảnh không còn tồn tại trong Asset Library.");
      const file = new File([stored.blob], stored.name, { type: stored.mimeType, lastModified: Date.parse(stored.updatedAt) || Date.now() });
      if (file.size > MAX_INPUT_BYTES) throw new Error("Ảnh đã lưu vượt giới hạn 10 MB của Image Studio.");
      setSource(file);
      setSourcePreview(URL.createObjectURL(file));
      setAssetPickerOpen(false);
      setNotice(`Đã chọn ảnh “${asset.name}” từ Asset Library.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể mở ảnh đã lưu.");
    } finally {
      setAssetLoadingId(null);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const result = await testGeminiConnection();
      if (!result.available) throw new Error("Gateway chưa xác nhận model Gemini khả dụng.");
      setConnection("ready");
      setNotice("Kết nối Gemini thành công. API Key được giữ ở Backend Gateway.");
    } catch (cause) {
      setConnection("failed");
      setError(cause instanceof Error ? cause.message : "Không thể kiểm tra kết nối Gemini.");
    } finally {
      setChecking(false);
    }
  };

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const input = {
        prompt: prompt.trim(),
        model,
        aspect_ratio: ratio,
        image_size: size,
        ...(source ? { image_base64: await fileToBase64(source), mime_type: source.type as "image/png" | "image/jpeg" | "image/webp" } : {}),
      };
      const response = await generateGeminiImage(input);
      const binary = atob(response.image.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const outputType = response.image.mime_type || "image/png";
      if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(outputType)) {
        throw new Error("Gateway trả về định dạng ảnh không được hỗ trợ.");
      }
      const blob = new Blob([bytes], { type: outputType });
      setResultUrl(URL.createObjectURL(blob));
      setResultMime(blob.type);
      setConnection("ready");
      setNotice("Đã hoàn tất. Ảnh kết quả chỉ được giữ trong phiên trình duyệt hiện tại.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo ảnh.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-300"><Sparkles size={14}/> PIECS CREATIVE · P8</div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Image Studio</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Tạo ảnh từ prompt hoặc chỉnh sửa ảnh tham chiếu bằng Gemini Nano Banana.</p>
        </div>
        <button type="button" onClick={checkConnection} disabled={checking || busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
          {checking ? <LoaderCircle className="animate-spin" size={14}/> : <CheckCircle2 size={14}/>} {checking ? "Đang kiểm tra..." : "Test Gemini connection"}
        </button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5 rounded-2xl border border-line bg-panel/70 p-5">
          <div>
            <label htmlFor="image-prompt" className="text-sm font-medium text-slate-200">Prompt</label>
            <textarea id="image-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={12000} rows={6} placeholder="Mô tả hình ảnh muốn tạo hoặc yêu cầu chỉnh sửa ảnh..." className="mt-2 w-full resize-y rounded-xl border border-line bg-[#090d16] p-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/60"/>
            <div className="mt-1 text-right text-[10px] text-slate-500">{prompt.length.toLocaleString()} / 12.000</div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-slate-200">Ảnh tham chiếu <span className="text-xs font-normal text-slate-500">(không bắt buộc)</span></span>{source && <button type="button" onClick={() => { setSource(null); setSourcePreview(""); }} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"><X size={12}/> Xóa ảnh</button>}</div>
            {sourcePreview ? <div className="relative overflow-hidden rounded-xl border border-line bg-[#090d16]"><img src={sourcePreview} alt="Ảnh tham chiếu đã chọn" className="max-h-64 w-full object-contain"/><div className="border-t border-line px-3 py-2 text-xs text-slate-400">{source?.name} · {((source?.size ?? 0) / 1024 / 1024).toFixed(2)} MB</div></div> : <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-[#090d16]/60 text-xs text-slate-400 hover:border-indigo-300/50 hover:text-indigo-200"><ImagePlus size={22}/> Upload image · tối đa 10 MB</button><button type="button" onClick={() => void openAssetPicker()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-[#090d16]/60 text-xs text-slate-400 hover:border-indigo-300/50 hover:text-indigo-200"><ImagePlus size={22}/> Chọn từ Asset Library</button></div>}
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Chọn ảnh tham chiếu" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }}/>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Model<select value={model} onChange={event => setModel(event.target.value as GeminiImageModel)} className="mt-2 h-11 w-full rounded-xl border border-line bg-[#090d16] px-3 text-sm text-slate-200 outline-none focus:border-indigo-400/60">{models.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="text-xs text-slate-400">Aspect ratio<select value={ratio} onChange={event => setRatio(event.target.value as ImageAspectRatio)} className="mt-2 h-11 w-full rounded-xl border border-line bg-[#090d16] px-3 text-sm text-slate-200 outline-none focus:border-indigo-400/60">{ratios.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="text-xs text-slate-400 sm:col-span-2">Resolution<select value={size} onChange={event => setSize(event.target.value as "1K" | "2K" | "4K")} className="mt-2 h-11 w-full rounded-xl border border-line bg-[#090d16] px-3 text-sm text-slate-200 outline-none focus:border-indigo-400/60"><option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option></select></label>
          </div>

          <button type="button" disabled={!prompt.trim() || busy} onClick={generate} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>} {busy ? "Đang xử lý ảnh..." : source ? "Chỉnh sửa ảnh" : "Tạo ảnh"}
          </button>
          <p className="text-[11px] leading-5 text-slate-500">Không cần nhập API Key tại đây. Gateway xác thực bằng cấu hình server-side qua reverse proxy an toàn.</p>
        </div>

        <div className="min-h-[420px] rounded-2xl border border-line bg-panel/70 p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">Kết quả</h3><p className="mt-1 text-xs text-slate-500">Preview ảnh được tạo hoặc chỉnh sửa</p></div>{resultUrl && <a href={resultUrl} download={`piecs-${Date.now()}.${resultMime === "image/jpeg" ? "jpg" : resultMime === "image/webp" ? "webp" : "png"}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-slate-300 hover:bg-white/5"><Download size={14}/> Tải ảnh</a>}</div>
          {resultUrl ? <div className="flex min-h-[340px] items-center justify-center overflow-hidden rounded-xl border border-line bg-[#090d16] p-2"><img src={resultUrl} alt="Ảnh kết quả Gemini" className="max-h-[560px] max-w-full object-contain"/></div> : <div className="flex min-h-[340px] flex-col items-center justify-center rounded-xl border border-dashed border-line bg-[#090d16]/50 text-center"><Upload size={28} className="mb-3 text-slate-600"/><p className="text-sm text-slate-400">Ảnh kết quả sẽ hiển thị tại đây</p><p className="mt-1 text-xs text-slate-600">Nhập prompt để bắt đầu</p></div>}
          {resultUrl && <p className="mt-3 text-[11px] text-slate-500">Định dạng: {resultMime} · Tải xuống để lưu trữ lâu dài.</p>}
        </div>
      </div>

      {assetPickerOpen && <div role="dialog" aria-modal="true" aria-labelledby="asset-picker-title" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
        <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-[#0c1220]">
          <div className="flex items-center justify-between border-b border-line p-4"><div><h3 id="asset-picker-title" className="text-sm font-semibold">Chọn ảnh từ Asset Library</h3><p className="mt-1 text-xs text-slate-500">Ảnh chỉ được tải vào Image Studio sau khi anh chọn.</p></div><button type="button" aria-label="Đóng Asset Picker" onClick={() => setAssetPickerOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><X size={18}/></button></div>
          <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
            {assetsLoading ? <p className="py-10 text-center text-sm text-slate-500">Đang tải danh sách ảnh...</p> : assets.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Asset Library chưa có ảnh nào.</p> : assets.map(asset => <button key={asset.id} type="button" disabled={assetLoadingId !== null} onClick={() => void chooseSavedAsset(asset)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3 text-left hover:border-indigo-300/40 disabled:opacity-50"><span className="min-w-0"><span className="block truncate text-sm text-slate-200">{asset.name}</span><span className="mt-1 block text-[10px] text-slate-500">{(asset.size / 1048576).toFixed(2)} MB · {asset.mimeType} · {asset.source === "workflow" ? "Workflow output" : "Upload"}</span></span><span className="shrink-0 text-xs text-indigo-200">{assetLoadingId === asset.id ? "Đang tải..." : "Chọn ảnh"}</span></button>)}
          </div>
        </div>
      </div>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-400/[.06] px-4 py-3 text-xs text-emerald-200">{notice}</p>}
      {connection === "ready" && <p className="text-[11px] text-emerald-300">Gemini connection verified during this session.</p>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-200"><AlertCircle size={14} className="mt-0.5 shrink-0"/>{error}</p>}
    </section>
  );
}
