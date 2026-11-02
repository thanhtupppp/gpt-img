import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { PiecsTemplate, TemplateProfile } from "../../domain/types";

type Props = {
  initial?: PiecsTemplate;
  onSave: (template: PiecsTemplate) => Promise<void>;
  onCancel: () => void;
};

const profiles: TemplateProfile[] = ["Professional", "Studio", "Master"];
const categories = ["Product Photography", "Portrait & Beauty", "Creative Compositing", "Advertising & Poster", "Photo Restoration", "Landscape & Nature", "Architecture & Interior", "Creative & Artistic"];

export function TemplateEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? categories[0]);
  const [profile, setProfile] = useState<TemplateProfile>(initial?.profile ?? "Professional");
  const [commands, setCommands] = useState(initial?.commandIds.join("\n") ?? "analyze\nqc");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const now = new Date().toISOString();
    const value: PiecsTemplate = {
      id: initial?.id ?? `CUSTOM-${crypto.randomUUID()}`,
      name: name.trim(),
      description: description.trim(),
      category,
      profile,
      commandIds: commands.split("\n").map((item) => item.trim().replace(/^\//, "")).filter(Boolean),
      parameters: initial?.parameters ?? {},
      tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
      origin: "custom",
      version: initial?.version ?? "1.0.0",
      schemaVersion: "1.0.0",
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    setSaving(true);
    setError("");
    try {
      await onSave(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu template.");
      setSaving(false);
    }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="template-editor-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-t-2xl border border-line bg-[#101827] p-5 shadow-2xl sm:rounded-2xl sm:p-7">
      <div className="flex items-center justify-between"><div><h2 id="template-editor-title" className="text-xl font-semibold">{initial ? "Edit custom template" : "Create custom template"}</h2><p className="mt-1 text-xs text-slate-400">Template cá nhân được lưu trên thiết bị này.</p></div><button type="button" onClick={onCancel} aria-label="Close editor" className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><X size={18}/></button></div>
      <label className="block text-xs text-slate-300">Template name<input required maxLength={80} value={name} onChange={event=>setName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-line bg-slate-950 px-3 text-sm outline-none focus:border-indigo-400"/></label>
      <label className="block text-xs text-slate-300">Description<textarea required maxLength={500} value={description} onChange={event=>setDescription(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-line bg-slate-950 p-3 text-sm outline-none focus:border-indigo-400"/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-300">Category<select value={category} onChange={event=>setCategory(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-line bg-slate-950 px-3 text-sm">{categories.map(item=><option key={item}>{item}</option>)}</select></label><label className="text-xs text-slate-300">Profile<select value={profile} onChange={event=>setProfile(event.target.value as TemplateProfile)} className="mt-2 h-11 w-full rounded-lg border border-line bg-slate-950 px-3 text-sm">{profiles.map(item=><option key={item}>{item}</option>)}</select></label></div>
      <label className="block text-xs text-slate-300">Command IDs (one per line)<textarea value={commands} onChange={event=>setCommands(event.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-line bg-slate-950 p-3 font-mono text-xs outline-none focus:border-indigo-400"/></label>
      <label className="block text-xs text-slate-300">Tags (comma separated)<input value={tags} onChange={event=>setTags(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-line bg-slate-950 px-3 text-sm outline-none focus:border-indigo-400"/></label>
      {error&&<p role="alert" className="rounded-lg bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-xs text-slate-300">Cancel</button><button disabled={saving} type="submit" className="rounded-lg bg-indigo-400 px-5 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-50">{saving?"Saving...":"Save template"}</button></div>
    </form>
  </div>;
}
