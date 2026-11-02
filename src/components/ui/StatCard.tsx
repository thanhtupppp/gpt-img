import type {LucideIcon} from "lucide-react";
type StatCardProps={icon:LucideIcon;label:string;value:string;note:string};
export function StatCard({icon:Icon,label,value,note}:StatCardProps){return <section aria-label={label} className="rounded-2xl border border-line bg-panel/65 p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>{label}</span><Icon size={16}/></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-[11px] text-slate-500">{note}</div></section>}
