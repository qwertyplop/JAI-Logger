import { useEffect, useState } from "react";
import { useLoggerState } from "@/hooks/use-logger-state";
import { Copy, Trash2, Activity, AlertCircle, ChevronDown, ChevronRight, ShieldCheck, RadioTower, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { JsonViewer } from "@/components/json-viewer";
import { LogEntry } from "@/types";

function formatRelativeTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const colors: Record<string, string> = {
    GET: "bg-blue-500/15 text-blue-300 border-blue-500/25",
    POST: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    PUT: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    DELETE: "bg-red-500/15 text-red-300 border-red-500/25",
  };
  return <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${colors[m] || "bg-zinc-500/15 text-zinc-300 border-zinc-500/25"}`}>{m}</span>;
}

function StatusBadge({ status }: { status: number }) {
  const cls = status >= 200 && status < 300
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
    : status >= 300 && status < 400
      ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
      : "bg-red-500/15 text-red-300 border-red-500/25";
  return <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${cls}`}>{status}</span>;
}

function LogItem({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-zinc-800/70 hover:bg-zinc-900/70 transition-colors">
      <button className="w-full flex items-center justify-between p-3 text-left select-none" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 overflow-hidden">
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
          <MethodBadge method={entry.method} />
          <StatusBadge status={entry.responseStatus} />
          <span className="font-mono text-sm truncate max-w-xl text-zinc-300">{entry.path}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {entry.isStream && <Badge variant="outline" className="text-cyan-300 border-cyan-500/30 text-[10px] uppercase font-mono px-1.5 py-0 h-5">STREAM</Badge>}
          {entry.error && <Badge variant="destructive" className="text-[10px] uppercase font-mono px-1.5 py-0 h-5">ERR</Badge>}
          <span className="font-mono text-xs text-zinc-500">{entry.durationMs}ms</span>
          <span className="font-mono text-xs text-zinc-500 w-20 text-right">{formatRelativeTime(entry.timestamp)}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-sm space-y-6">
          {entry.error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg font-mono text-xs">Error: {entry.error}</div>}
          <div className="space-y-3">
            <h4 className="font-semibold text-xs tracking-wider text-zinc-500 uppercase">Request</h4>
            {Object.keys(entry.requestHeaders).length > 0 && (
              <div className="grid grid-cols-[170px_1fr] gap-x-4 gap-y-1 font-mono text-xs text-zinc-300 bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                {Object.entries(entry.requestHeaders).map(([k, v]) => <div key={k} className="contents"><div className="text-zinc-500 truncate" title={k}>{k}:</div><div className="truncate" title={v}>{v}</div></div>)}
              </div>
            )}
            {entry.requestBody && <JsonViewer data={entry.requestBody} />}
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold text-xs tracking-wider text-zinc-500 uppercase">Response</h4>
            {Object.keys(entry.responseHeaders).length > 0 && (
              <div className="grid grid-cols-[170px_1fr] gap-x-4 gap-y-1 font-mono text-xs text-zinc-300 bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                {Object.entries(entry.responseHeaders).map(([k, v]) => <div key={k} className="contents"><div className="text-zinc-500 truncate" title={k}>{k}:</div><div className="truncate" title={v}>{v}</div></div>)}
              </div>
            )}
            {entry.responseBody && <JsonViewer data={entry.responseBody} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { logs, clearLogs, status, accessToken, session, saveUpstreamUrl } = useLoggerState();
  const { toast } = useToast();
  const [upstreamDraft, setUpstreamDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const proxyUrl = accessToken ? `${window.location.origin}/api/proxy/${encodeURIComponent(accessToken)}` : "";

  const copyToClipboard = (value: string, label: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => toast({ title: "Скопировано", description: label }));
  };

  const handleSaveUpstream = async () => {
    setSaving(true);
    try {
      await saveUpstreamUrl(upstreamDraft);
      toast({ title: "Upstream сохранен", description: "Теперь можно отправлять запросы через proxy endpoint." });
    } catch (error) {
      toast({ title: "Ошибка", description: error instanceof Error ? error.message : "Не удалось сохранить URL", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (session?.upstreamUrl && !upstreamDraft) setUpstreamDraft(session.upstreamUrl);
  }, [session?.upstreamUrl, upstreamDraft]);

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-zinc-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">JAI Proxy Logger</h1>
          <p className="text-zinc-400 text-sm">Нужна временная сессионная ссылка из админ-панели. Откройте ссылку вида <span className="font-mono text-zinc-200">/?token=...</span>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      <header className="flex-none border-b border-zinc-800 bg-zinc-950/95 p-5">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-400" />JAI Proxy Logger</h1>
              <p className="text-zinc-400 mt-2 max-w-2xl">
                Вставь полный HTTPS endpoint своего провайдера до <code className="text-emerald-300">/chat/completions</code>. Логгер будет пересылать только POST-запросы к этому конкретному endpoint и показывать request/response для отладки.
              </p>
            </div>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">{session?.label || "User Session"}</Badge>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Ваш provider endpoint</label>
              <div className="flex gap-2">
                <Input className="font-mono text-sm bg-zinc-950 border-zinc-800" placeholder="https://provider.example/v1/chat/completions" value={upstreamDraft || session?.upstreamUrl || ""} onChange={(e) => setUpstreamDraft(e.target.value)} />
                <Button onClick={handleSaveUpstream} disabled={saving} className="shrink-0">{saving ? "..." : "Сохранить"}</Button>
                <Button size="icon" variant="secondary" onClick={() => copyToClipboard(session?.upstreamUrl || "", "Provider endpoint скопирован")}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <label className="text-xs font-mono text-emerald-300 uppercase tracking-wider flex items-center gap-2"><RadioTower className="w-3 h-3" />Proxy endpoint</label>
              <div className="flex gap-2">
                <Input readOnly className="font-mono text-sm bg-zinc-950 border-emerald-500/30 text-emerald-200" value={proxyUrl} />
                <Button size="icon" onClick={() => copyToClipboard(proxyUrl, "Proxy endpoint готов для вставки")}><Copy className="w-4 h-4" /></Button>
              </div>
              <p className="text-zinc-500 text-sm mt-1">Скопируй этот URL в Janitor/SillyTavern как OpenAI-compatible endpoint. Все POST-запросы будут идти в сохраненный provider URL.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800/70 sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
            <h2 className="text-sm font-semibold font-mono tracking-tight flex items-center gap-2">Логи запросов <Badge variant="secondary" className="font-mono text-xs">{logs.length}</Badge></h2>
            <Button variant="ghost" size="sm" onClick={clearLogs} className="text-zinc-500 hover:text-red-300 h-8 text-xs font-mono"><Trash2 className="w-4 h-4 mr-2" />Очистить локально</Button>
          </div>
          <div className="flex-1 overflow-auto rounded-b-2xl border-x border-zinc-800/60">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4"><AlertCircle className="w-8 h-8 opacity-25" /><p className="text-sm font-mono opacity-70">Пока нет трафика. Сохраните provider endpoint и сделайте запрос через proxy endpoint.</p></div>
            ) : <div className="flex flex-col pb-10">{logs.map((log) => <LogItem key={log.id} entry={log} />)}</div>}
          </div>
        </div>
      </main>

      <footer className="flex-none border-t border-zinc-800 bg-zinc-950 p-2 px-5 flex items-center justify-between text-xs font-mono text-zinc-500">
        <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${status === "Connected" ? "bg-emerald-400 animate-pulse" : status === "Reconnecting..." ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />{status}</div>
        <div>Limit: 500 entries</div>
      </footer>
    </div>
  );
}
