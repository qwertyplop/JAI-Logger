import { useState, useEffect, useCallback } from "react";
import { AccessSession, LogEntry } from "../types";

export type ConnectionStatus = "Connected" | "Reconnecting..." | "Disconnected";

function getAccessToken(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get("token");
  if (tokenFromUrl) {
    localStorage.setItem("jai_debug_access_token", tokenFromUrl);
    return tokenFromUrl;
  }
  return localStorage.getItem("jai_debug_access_token");
}

export function useLoggerState() {
  const [accessToken] = useState<string | null>(() => getAccessToken());
  const [session, setSession] = useState<AccessSession | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const raw = localStorage.getItem("jai_debug_logs");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState<ConnectionStatus>("Disconnected");

  const refreshLogs = useCallback(async () => {
    if (!accessToken) {
      setStatus("Disconnected");
      return;
    }
    setStatus("Reconnecting...");
    try {
      const res = await fetch(`/api/logs/history?token=${encodeURIComponent(accessToken)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load history");
      setSession(data.session);
      setLogs(data.logs || []);
      setStatus("Connected");
    } catch {
      setStatus("Disconnected");
    }
  }, [accessToken]);

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
    localStorage.setItem("jai_debug_logs", JSON.stringify(logs.slice(0, 500)));
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    localStorage.removeItem("jai_debug_logs");
  }, []);

  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  return { logs, clearLogs, status, accessToken, session, saveUpstreamUrl, refreshLogs };
}
