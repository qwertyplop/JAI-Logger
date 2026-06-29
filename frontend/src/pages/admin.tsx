import React, { useEffect, useMemo, useState } from "react";
import { Activity, Check, Copy, Eye, LogOut, Plus, RefreshCw, Shield, Trash2, X } from "lucide-react";
import { AccessSession, LogEntry } from "@/types";
import { JsonViewer } from "@/components/json-viewer";

const durationOptions = [
  { value: 15, label: "15 минут" },
  { value: 30, label: "30 минут" },
  { value: 60, label: "1 час" },
];

const extendOptions = [
  { value: 15, label: "+15м" },
  { value: 30, label: "+30м" },
  { value: 60, label: "+1ч" },
];

function formatRemaining(ms = 0) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const seconds = Math.max(0, Math.floor((ms % 60000) / 1000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
  return `${minutes}м ${seconds}с`;
}

function AdminLogViewer({ session, logs, onClose }: { session: AccessSession; logs: LogEntry[]; onClose: () => void }) {
  const [selected, setSelected] = useState<LogEntry | null>(logs[0] || null);

  useEffect(() => setSelected(logs[0] || null), [logs]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-6 flex items-center justify-center">
      <div className="w-full max-w-6xl h-[82vh] rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-lg font-bold">Логи сессии</h2>
            <p className="text-xs text-zinc-500 font-mono">{session.label || session.sessionId} · {logs.length} записей</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-[360px_1fr] min-h-0 flex-1">
          <div className="border-r border-zinc-800 overflow-auto">
            {logs.length === 0 ? <div className="p-8 text-zinc-600 text-sm">Логов пока нет.</div> : logs.map((log) => (
              <button key={log.id} onClick={() => setSelected(log)} className={`w-full p-3 text-left border-b border-zinc-900 hover:bg-zinc-900 ${selected?.id === log.id ? "bg-zinc-900" : ""}`}>
                <div className="flex items-center gap-2 mb-1"><span className="font-mono text-xs text-emerald-300">{log.method}</span><span className="font-mono text-xs text-zinc-500">{log.responseStatus}</span><span className="font-mono text-xs text-zinc-600 ml-auto">{log.durationMs}ms</span></div>
                <div className="font-mono text-xs text-zinc-400 truncate">{log.path}</div>
              </button>
            ))}
          </div>
          <div className="overflow-auto p-5 space-y-5">
            {!selected ? <div className="text-zinc-600 text-sm">Выберите запрос.</div> : (
              <>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Request</div>
                  <div className="font-mono text-xs text-zinc-400 mb-3 break-all">{selected.method} {selected.path}</div>
                  <JsonViewer data={selected.requestBody} />
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Response · {selected.responseStatus}</div>
                  <JsonViewer data={selected.responseBody} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [secretWords, setSecretWords] = useState(Array(6).fill(""));
  const secret = secretWords.join(" ").trim();
  const [isAuth, setIsAuth] = useState(false);
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [error, setError] = useState("");
  const [duration, setDuration] = useState(30);
  const [label, setLabel] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [clearDone, setClearDone] = useState(false);
  const [deletedToken, setDeletedToken] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ session: AccessSession; logs: LogEntry[] } | null>(null);

  const activeCount = useMemo(() => sessions.filter((s) => (s.remainingTime || 0) > 0).length, [sessions]);

  const loadSessions = async (showFeedback = false) => {
    const res = await fetch("/api/admin/sessions", { headers: { "x-jai-admin-ui": "manual-refresh-v1" } });
    if (res.status === 401) {
      setIsAuth(false);
      return;
    }
    if (res.ok) {
      setSessions(await res.json());
      if (showFeedback) {
        setRefreshDone(true);
        window.setTimeout(() => setRefreshDone(false), 1500);
      }
    }
  };

  const checkAuth = async () => {
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (!res.ok) {
      setError("Неверная секретная фраза");
      return;
    }
    setSecretWords(Array(6).fill(""));
    setIsAuth(true);
    await loadSessions();
  };

  const updateSecretWord = (index: number, value: string) => {
    const cleaned = value.trim();
    const pastedWords = cleaned.split(/\s+/).filter(Boolean);

    setSecretWords((prev) => {
      const next = [...prev];
      if (pastedWords.length > 1) {
        pastedWords.slice(0, 6 - index).forEach((word, offset) => {
          next[index + offset] = word;
        });
      } else {
        next[index] = value.replace(/\s/g, "");
      }
      return next;
    });

    if (pastedWords.length > 1) {
      const target = Math.min(5, index + pastedWords.length - 1);
      requestAnimationFrame(() => document.getElementById(`secret-word-${target}`)?.focus());
    }
  };

  const handleSecretKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !secretWords[index] && index > 0) {
      document.getElementById(`secret-word-${index - 1}`)?.focus();
      return;
    }
    if (event.key === "Enter") checkAuth();
  };

  const generateLink = async () => {
    setError("");
    setGeneratedLink("");
    const res = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes: duration, label }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Не удалось создать сессию");
      return;
    }
    setGeneratedLink(data.link);
    await loadSessions();
  };

  const killSession = async (token: string) => {
    const res = await fetch(`/api/admin/sessions/${encodeURIComponent(token)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось отозвать сессию");
      return;
    }
    setSessions((prev) => prev.filter((s) => s.token !== token));
    setDeletedToken(token);
    window.setTimeout(() => setDeletedToken(null), 1500);
  };

  const extendSession = async (token: string, addMinutes: number) => {
    const res = await fetch(`/api/admin/sessions/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addMinutes }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Не удалось продлить сессию");
      return;
    }
    await loadSessions();
    setError("");
  };

  const clearAllSessions = async () => {
    const res = await fetch("/api/admin/sessions", { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось очистить сессии");
      return;
    }
    setSessions([]);
    setClearDone(true);
    window.setTimeout(() => setClearDone(false), 1800);
  };

  const openLogs = async (session: AccessSession) => {
    const res = await fetch(`/api/admin/sessions/${encodeURIComponent(session.token)}/logs`);
    setViewer({ session, logs: res.ok ? await res.json() : [] });
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAuth(false);
    setSessions([]);
  };

  useEffect(() => {
    fetch("/api/admin/me").then(async (res) => {
      const data = await res.json();
      setIsAuth(Boolean(data.authenticated));
      if (data.authenticated) loadSessions();
    });
  }, []);

  const copy = async (value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  if (!isAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-4 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900/80 rounded-3xl border border-zinc-800 shadow-2xl">
          <Shield className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2 text-center">JAI Admin</h1>
          <p className="text-zinc-500 text-center text-sm mb-8">Введите неизменяемую фразу из 6 слов</p>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {secretWords.map((word, index) => (
                <label key={index} className="group flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                  <span className="w-5 text-xs font-mono text-zinc-600">{index + 1}</span>
                  <input
                    id={`secret-word-${index}`}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder-zinc-700"
                    placeholder="word"
                    value={word}
                    onChange={(e) => updateSecretWord(index, e.target.value)}
                    onKeyDown={(e) => handleSecretKeyDown(index, e)}
                  />
                </label>
              ))}
            </div>
            <button onClick={checkAuth} className="w-full py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold rounded-xl transition-all active:scale-[0.98]">Войти</button>
            {error && <p className="text-red-400 text-center text-sm">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      {viewer && <AdminLogViewer session={viewer.session} logs={viewer.logs} onClose={() => setViewer(null)} />}
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-3"><Activity className="w-8 h-8 text-emerald-400" />JAI Admin</h1>
            <p className="text-zinc-500 mt-1">Генерация временных debug-ссылок и просмотр AI request/response логов. Provider endpoint пользователь указывает сам на своей сессионной странице.</p>
          </div>
          <div className="flex flex-wrap gap-3"><button onClick={() => loadSessions(true)} className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-all ${refreshDone ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"}`}>{refreshDone ? <Check className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}{refreshDone ? "Готово" : "Обновить"}</button><button onClick={clearAllSessions} className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-all ${clearDone ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-red-300 hover:bg-red-500/10"}`}>{clearDone ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}{clearDone ? "Очищено" : "Очистить всё"}</button><button onClick={logout} className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-300 flex items-center gap-2"><LogOut className="w-4 h-4" />Выйти</button></div>
        </header>

        <section className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-400" />Новая сессия</h2>
            <div className="grid md:grid-cols-[1fr_180px] gap-4">
              <div className="space-y-2"><label className="text-xs uppercase tracking-wider text-zinc-500">Название / заметка</label><input className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Например: User A / OpenRouter debug" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
              <div className="space-y-2"><label className="text-xs uppercase tracking-wider text-zinc-500">Время жизни</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 outline-none">{durationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            </div>
            <div className="flex justify-end">
              <button onClick={generateLink} className="px-6 py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold rounded-xl transition-all active:scale-95">Создать временную ссылку</button>
            </div>
            {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 p-3 text-sm">{error}</div>}
            {generatedLink && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="text-xs uppercase tracking-wider text-emerald-300 mb-2">Сессионная ссылка для пользователя</div><div className="flex gap-2"><input readOnly className="flex-1 p-3 bg-zinc-950 border border-emerald-500/30 rounded-xl text-emerald-200 font-mono text-sm" value={generatedLink} /><button onClick={() => copy(generatedLink)} className={`px-4 rounded-xl font-bold transition-all min-w-28 flex items-center justify-center gap-2 ${copiedLink ? "bg-emerald-500 text-white" : "bg-emerald-400 text-zinc-950 hover:bg-emerald-300"}`}>{copiedLink ? <><Check className="w-4 h-4" />Готово</> : <><Copy className="w-4 h-4" />Копировать</>}</button></div></div>}
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 grid grid-cols-2 gap-4 content-start">
            <div><div className="text-3xl font-black">{sessions.length}</div><div className="text-xs text-zinc-500 uppercase tracking-wider">Всего сессий</div></div>
            <div><div className="text-3xl font-black text-emerald-300">{activeCount}</div><div className="text-xs text-zinc-500 uppercase tracking-wider">Активных</div></div>
            <div><div className="text-3xl font-black">{sessions.reduce((sum, s) => sum + (s.logCount || 0), 0)}</div><div className="text-xs text-zinc-500 uppercase tracking-wider">Логов</div></div>
            <div><div className="text-3xl font-black">{sessions.reduce((sum, s) => sum + (s.connectedClients || 0), 0)}</div><div className="text-xs text-zinc-500 uppercase tracking-wider">Онлайн</div></div>
          </div>
        </section>

        <section className="bg-zinc-900/60 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-900 text-zinc-500 text-xs uppercase tracking-widest"><tr className="border-b border-zinc-800"><th className="p-4 font-semibold">Сессия</th><th className="p-4 font-semibold">Endpoint пользователя</th><th className="p-4 font-semibold">Статус</th><th className="p-4 font-semibold">Логи</th><th className="p-4 font-semibold text-right">Действия</th></tr></thead>
            <tbody className="divide-y divide-zinc-800">
              {sessions.length === 0 ? <tr><td colSpan={5} className="p-16 text-center text-zinc-600 italic">Активных сессий пока нет.</td></tr> : sessions.map((s) => (
                <tr key={s.token} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="p-4"><div className="font-semibold text-zinc-200">{s.label || "Без названия"}</div><div className="font-mono text-xs text-zinc-600">{s.token.slice(0, 18)}...</div></td>
                  <td className="p-4 max-w-md"><div className={`font-mono text-xs truncate ${s.upstreamUrl ? "text-zinc-400" : "text-amber-300"}`} title={s.upstreamUrl || "Пользователь еще не указал endpoint"}>{s.upstreamUrl || "Endpoint еще не указан"}</div><div className="text-xs text-zinc-600 mt-1">Создано: {new Date(s.createdAt).toLocaleString()}</div></td>
                  <td className="p-4"><div className="flex items-center gap-2 text-xs font-bold"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span>{formatRemaining(s.remainingTime)}</span></div></td>
                  <td className="p-4"><div className="font-mono text-sm text-zinc-300">{s.logCount || 0}</div></td>
                  <td className="p-4"><div className="flex justify-end gap-2 flex-wrap"><button onClick={() => extendSession(s.token, 15)} className="px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700">+15м</button><button onClick={() => extendSession(s.token, 30)} className="px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700">+30м</button><button onClick={() => extendSession(s.token, 60)} className="px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700">+1ч</button><button onClick={() => window.open(`/?token=${encodeURIComponent(s.token)}`, "_blank")} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg" title="Открыть пользовательскую страницу"><Eye className="w-4 h-4" /></button><button onClick={() => openLogs(s)} className="p-2 text-zinc-400 hover:text-emerald-300 bg-zinc-800 rounded-lg" title="Посмотреть логи"><Activity className="w-4 h-4" /></button><button onClick={() => killSession(s.token)} className={`p-2 rounded-lg transition-all ${deletedToken === s.token ? "text-emerald-300 bg-emerald-500/10" : "text-zinc-400 hover:text-red-300 bg-zinc-800"}`} title="Отозвать">{deletedToken === s.token ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
