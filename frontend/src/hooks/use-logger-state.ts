import { useState, useEffect, useCallback } from "react";
import { AccessSession, LogEntry } from "../types";

export type ConnectionStatus = "Connected" | "Reconnecting..." | "Disconnected";

function getAccessToken(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get("token");
  if (tokenFromUrl) {
    localStorage.setItem("proxy_access_token", tokenFromUrl);
    return tokenFromUrl;
  }
  return localStorage.getItem("proxy_access_token");
}

export function useLoggerState() {
  const [accessToken] = useState<string | null>(() => getAccessToken());
  const [session, setSession] = useState<AccessSession | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const raw = localStorage.getItem("proxy_logs");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState<ConnectionStatus>(accessToken ? "Disconnected" : "Disconnected");

  const saveUpstreamUrl = useCallback(async (upstreamUrl: string) => {
    if (!accessToken) throw new Error("Нет access token");
    const res = await fetch(`/api/session/upstream?token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upstreamUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Не удалось сохранить upstream URL");
    setSession(data.session);
    return data.session as AccessSession;
  }, [accessToken]);

  useEffect(() => {
    localStorage.setItem("proxy_logs", JSON.stringify(logs.slice(0, 500)));
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    localStorage.removeItem("proxy_logs");
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setStatus("Disconnected");
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/logs/history?token=${encodeURIComponent(accessToken)}`);
        if (!res.ok) throw new Error("Failed to load history");
        const data = await res.json();
        if (!cancelled) {
          setSession(data.session);
          setLogs(data.logs || []);
        }
      } catch {
        if (!cancelled) setStatus("Disconnected");
      }
    };

    const connect = () => {
      setStatus("Reconnecting...");
      eventSource = new EventSource(`/api/logs/stream?token=${encodeURIComponent(accessToken)}`);

      eventSource.onopen = () => setStatus("Connected");
      eventSource.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs((prev) => [entry, ...prev.filter((log) => log.id !== entry.id)].slice(0, 500));
        } catch {}
      };
      eventSource.onerror = () => {
        setStatus("Disconnected");
        eventSource?.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    loadHistory().then(() => {
      if (!cancelled) connect();
    });

    return () => {
      cancelled = true;
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [accessToken]);

  return { logs, clearLogs, status, accessToken, session, saveUpstreamUrl };
}
