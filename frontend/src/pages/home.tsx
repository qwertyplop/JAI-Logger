import { useState } from "react";
import { useLoggerState } from "@/hooks/use-logger-state";
import { Copy, Trash2, Activity, AlertCircle, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
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
  let colorClass = "bg-gray-600 text-white";
  if (m === "GET") colorClass = "bg-blue-600 text-white";
  else if (m === "POST") colorClass = "bg-green-600 text-white";
  else if (m === "PUT") colorClass = "bg-yellow-600 text-white";
  else if (m === "DELETE") colorClass = "bg-red-600 text-white";
  
  return (
    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${colorClass}`}>
      {m}
    </span>
  );
}

function StatusBadge({ status }: { status: number }) {
  let colorClass = "bg-gray-600 text-white";
  if (status >= 200 && status < 300) colorClass = "bg-green-600 text-white";
  else if (status >= 300 && status < 400) colorClass = "bg-yellow-600 text-white";
  else if (status >= 400) colorClass = "bg-red-600 text-white";
  
  return (
    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${colorClass}`}>
      {status}
    </span>
  );
}

function LogItem({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border hover:bg-muted/30 transition-colors">
      <div 
        className="flex items-center justify-between p-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <MethodBadge method={entry.method} />
          <StatusBadge status={entry.responseStatus} />
          <span className="font-mono text-sm truncate max-w-sm text-foreground/80">{entry.path}</span>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          {entry.isStream && (
            <Badge variant="outline" className="text-blue-400 border-blue-400/30 text-[10px] uppercase font-mono px-1.5 py-0 h-5">STREAM</Badge>
          )}
          {entry.error && (
            <Badge variant="destructive" className="text-[10px] uppercase font-mono px-1.5 py-0 h-5">ERR</Badge>
          )}
          <span className="font-mono text-xs text-muted-foreground">{entry.durationMs}ms</span>
          <span className="font-mono text-xs text-muted-foreground w-20 text-right">{formatRelativeTime(entry.timestamp)}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-4 bg-muted/20 border-t border-border/50 text-sm space-y-6">
          {entry.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md font-mono text-xs">
              Error: {entry.error}
            </div>
          )}
          
          <div className="space-y-3">
            <h4 className="font-semibold text-xs tracking-wider text-muted-foreground uppercase">Request</h4>
            {Object.keys(entry.requestHeaders).length > 0 && (
              <div className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1 font-mono text-xs text-foreground/70 bg-card p-3 rounded-md border border-card-border">
                {Object.entries(entry.requestHeaders).map(([k, v]) => (
                  <div key={k} className="contents">
                    <div className="text-muted-foreground truncate" title={k}>{k}:</div>
                    <div className="truncate" title={v}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            {entry.requestBody && <JsonViewer data={entry.requestBody} />}
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-xs tracking-wider text-muted-foreground uppercase">Response</h4>
            {Object.keys(entry.responseHeaders).length > 0 && (
              <div className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1 font-mono text-xs text-foreground/70 bg-card p-3 rounded-md border border-card-border">
                {Object.entries(entry.responseHeaders).map(([k, v]) => (
                  <div key={k} className="contents">
                    <div className="text-muted-foreground truncate" title={k}>{k}:</div>
                    <div className="truncate" title={v}>{v}</div>
                  </div>
                ))}
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
  const { logs, clearLogs, status, upstreamUrl, setUpstreamUrl, sessionId } = useLoggerState();
  const { toast } = useToast();

  const proxyUrl = upstreamUrl
    ? `${window.location.origin}/api/proxy/${sessionId}?target=${encodeURIComponent(upstreamUrl)}`
    : "";

  const copyToClipboard = () => {
    if (!proxyUrl) return;
    navigator.clipboard.writeText(proxyUrl).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "Proxy URL is ready to use.",
      });
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      <header className="flex-none border-b border-border bg-card p-4">
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight font-mono flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              AI Proxy Logger
            </h1>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Upstream URL</label>
              <Input 
                className="font-mono text-sm h-9 bg-background"
                placeholder="https://api.openai.com/v1/chat/completions"
                value={upstreamUrl}
                onChange={(e) => setUpstreamUrl(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex justify-between">
                <span>Proxy URL</span>
                <span className="text-primary/70">Paste into SillyTavern/JanitorAI</span>
              </label>
              <div className="flex gap-2">
                <Input 
                  readOnly
                  className="font-mono text-sm h-9 bg-background text-primary/80 border-primary/20"
                  value={proxyUrl}
                  placeholder="Enter upstream URL first"
                />
                <Button size="icon" className="h-9 w-9 shrink-0" onClick={copyToClipboard} disabled={!proxyUrl}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-background">
        <div className="max-w-6xl mx-auto h-full flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10">
            <h2 className="text-sm font-semibold font-mono tracking-tight flex items-center gap-2">
              Requests
              <Badge variant="secondary" className="font-mono text-xs">{logs.length}</Badge>
            </h2>
            <Button variant="ghost" size="sm" onClick={clearLogs} className="text-muted-foreground hover:text-destructive h-8 text-xs font-mono">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                <AlertCircle className="w-8 h-8 opacity-20" />
                <p className="text-sm font-mono opacity-60">No traffic captured yet.</p>
              </div>
            ) : (
              <div className="flex flex-col pb-10">
                {logs.map((log) => (
                  <LogItem key={log.id} entry={log} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="flex-none border-t border-border bg-card p-2 px-4 flex items-center justify-between text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              status === 'Connected' ? 'bg-primary animate-pulse' : 
              status === 'Reconnecting...' ? 'bg-yellow-500 animate-pulse' : 
              'bg-destructive'
            }`} />
            {status}
          </div>
        </div>
        <div>
          Limit: 500 entries
        </div>
      </footer>
    </div>
  );
}
