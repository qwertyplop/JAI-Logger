import { useEffect, useRef, useState } from "react";
import { useLoggerState } from "@/hooks/use-logger-state";
import { Check, Copy, Trash2, Activity, AlertCircle, ChevronDown, ChevronRight, ShieldCheck, RadioTower, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { JsonViewer } from "@/components/json-viewer";
import { LogEntry, AccessSession } from "@/types";

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
  const { logs, clearLogs, status, accessToken, session, saveUpstreamUrl, refreshLogs } = useLoggerState();
  const { toast } = useToast();
  const [upstreamDraft, setUpstreamDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"provider" | "debug" | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [refreshedOk, setRefreshedOk] = useState(false);
  const [clearedOk, setClearedOk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"links" | "logs">("links");
  const [providerDirty, setProviderDirty] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const savedProvider = session?.upstreamUrl || "";
  const debugUrl = accessToken ? `${window.location.origin}/api/ai-debug/${encodeURIComponent(accessToken)}` : "";

  const flash = (setter: (value: boolean) => void) => {
    setter(true);
    window.setTimeout(() => setter(false), 1600);
  };

  const copyToClipboard = (value: string, label: string, key: "provider" | "debug") => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? null : current), 1600);
      toast({ title: "Скопировано", description: label });
    });
  };

  const handleSaveUpstream = async () => {
    setSaving(true);
    try {
      await saveUpstreamUrl(upstreamDraft);
      setProviderDirty(false);
      flash(setSavedOk);
      toast({ title: "Endpoint сохранен", description: "Теперь можно отправлять AI-запросы через debug endpoint." });
    } catch (error) {
      toast({ title: "Ошибка", description: error instanceof Error ? error.message : "Не удалось сохранить URL", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleProviderFocus = () => {
    if (!upstreamDraft && !providerDirty && savedProvider) {
      setUpstreamDraft(savedProvider);
    }
  };

  const handleRefreshLogs = async () => {
    setRefreshing(true);
    try {
      await refreshLogs();
      flash(setRefreshedOk);
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearLogs = () => {
    clearLogs();
    flash(setClearedOk);
  };

  useEffect(() => {
    if (!providerDirty && savedProvider && upstreamDraft !== savedProvider) {
      setUpstreamDraft(savedProvider);
    }
  }, [savedProvider, providerDirty, upstreamDraft]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const scrollEl = el.querySelector(".flex-1.overflow-auto") || el;
    let lastY = scrollEl.scrollTop;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = scrollEl.scrollTop;
        if (y <= 0) setCollapsed(false);
        else if (y > lastY + 40) setCollapsed(true);
        else if (y < lastY - 20) setCollapsed(false);
        lastY = y;
      });
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [activeTab]);

  if (status === "Revoked") {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center border border-red-900/60 bg-red-950/20 rounded-3xl p-8">
          <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Сессия отозвана или истекла</h1>
          <p className="text-zinc-400 text-sm">Эта временная ссылка больше не работает. Запросы через старый endpoint будут получать 403 и не будут уходить к провайдеру.</p>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-zinc-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">JAI Request Debugger</h1>
          <p className="text-zinc-500">Откройте временную ссылку, которую выдал администратор.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
        <div className="overflow-hidden min-h-0">
          <header className="bg-zinc-950/95 border-b border-zinc-800 p-4 md:p-5">
            <div className="max-w-7xl mx-auto space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-400" />JAI Request Debugger</h1>
                  <p className="text-zinc-400 mt-2 max-w-2xl text-sm md:text-base">
                    Вставь полный HTTPS endpoint своего провайдера <span className="text-emerald-300">включая /chat/completions</span>. Логгер будет пересылать только POST-запросы к этому конкретному endpoint и показывать request/response для отладки.
                  </p>
                </div>
                <div className="flex">
                  <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-0.5">
                    <button onClick={() => setActiveTab("links")} className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg ${activeTab === "links" ? "bg-zinc-800 text-white" : "text-zinc-400"}`}>Ссылки</button>
                    <button onClick={() => setActiveTab("logs")} className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg ${activeTab === "logs" ? "bg-zinc-800 text-white" : "text-zinc-400"}`}>Логи</button>
                  </div>
                </div>
                <Badge variant="outline" className="border-zinc-700 text-zinc-300 hidden md:inline-flex">Temporary Session</Badge>
              </div>
            </div>
          </header>
        </div>
      </div>

      <main ref={mainRef} className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {activeTab === "links" && (
            <div className="p-4 md:p-5 space-y-4">
              <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Ваш provider endpoint</label>
                <div className="flex gap-2">
                  <Input
                    className="font-mono text-sm bg-zinc-950 border-zinc-800"
                    placeholder="https://provider.example/v1/chat/completions"
                    value={upstreamDraft}
                    onChange={(e) => { setProviderDirty(true); setUpstreamDraft(e.target.value); }}
                    onFocus={handleProviderFocus}
                  />
                  <Button onClick={handleSaveUpstream} disabled={saving} className="shrink-0 min-w-28">{saving ? "..." : savedOk ? <span className="inline-flex items-center gap-1"><Check className="w-4 h-4" />Готово</span> : "Сохранить"}</Button>
                  <Button size="icon" variant="secondary" onClick={() => copyToClipboard(savedProvider, "Provider endpoint скопирован", "provider")} title="Скопировать provider endpoint">{copied === "provider" ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}</Button>
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <label className="text-xs font-mono text-emerald-300 uppercase tracking-wider flex items-center gap-2"><RadioTower className="w-3 h-3" />AI debug endpoint</label>
                <div className="flex gap-2">
                  <Input readOnly className="font-mono text-sm bg-zinc-950 border-emerald-500/30 text-emerald-200" value={debugUrl} />
                  <Button size="icon" onClick={() => copyToClipboard(debugUrl, "AI debug endpoint готов для вставки", "debug")} title="Скопировать AI debug endpoint">{copied === "debug" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
                </div>
                <p className="text-zinc-500 text-sm mt-1">Скопируй этот URL в Janitor/SillyTavern как OpenAI-compatible endpoint. Все POST-запросы будут идти в сохраненный provider URL.</p>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800/70 bg-zinc-950/95 backdrop-blur z-10">
                <h2 className="text-sm font-semibold font-mono tracking-tight flex items-center gap-2">Логи запросов <Badge variant="secondary" className="font-mono text-xs">{logs.length}</Badge></h2>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleRefreshLogs} disabled={refreshing} className="h-8 text-xs font-mono min-w-28">{refreshing ? <span className="inline-flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />...</span> : refreshedOk ? <span className="inline-flex items-center gap-2"><Check className="w-3.5 h-3.5" />Готово</span> : "Обновить"}</Button>
                  <Button variant="ghost" size="sm" onClick={handleClearLogs} className="text-zinc-500 hover:text-red-300 h-8 text-xs font-mono min-w-40">{clearedOk ? <><Check className="w-4 h-4 mr-2 text-emerald-300" />Очищено</> : <><Trash2 className="w-4 h-4 mr-2" />Очистить локально</>}</Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 p-6"><AlertCircle className="w-8 h-8 opacity-25" /><p className="text-sm font-mono opacity-70 text-center">Пока нет трафика. На вкладке Ссылки сохраните provider endpoint и сделайте POST-запрос через AI debug endpoint.</p></div>
                ) : (
                  <div className="flex flex-col pb-10">{logs.map((log) => <LogItem key={log.id} entry={log} />)}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="flex-none border-t border-zinc-800 bg-zinc-950 p-2 px-5 flex items-center justify-between text-xs font-mono text-zinc-500">
        <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${status === "Connected" ? "bg-emerald-400" : status === "Reconnecting..." ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />{status === "Connected" ? "Loaded" : status}</div>
        <div>Manual refresh · stored in Upstash Redis</div>
      </footer>
    </div>
  );
}
