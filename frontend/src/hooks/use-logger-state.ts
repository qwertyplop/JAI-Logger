import { useState, useEffect, useCallback } from "react";
import { LogEntry } from "../types";

export type ConnectionStatus = "Connected" | "Reconnecting..." | "Disconnected";

function getOrCreateSessionId(): string {
  const key = "proxy_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function useLoggerState() {
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const [upstreamUrl, setUpstreamUrl] = useState(() => {
    return localStorage.getItem("proxy_upstream_url") || "";
  });
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const stored = localStorage.getItem("proxy_logs");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState<ConnectionStatus>("Disconnected");

  useEffect(() => {
    localStorage.setItem("proxy_upstream_url", upstreamUrl);
  }, [upstreamUrl]);

  useEffect(() => {
    localStorage.setItem("proxy_logs", JSON.stringify(logs));
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    localStorage.removeItem("proxy_logs");
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("Reconnecting...");
      
      // Extract token from URL to pass to SSE
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      const streamUrl = token 
        ? `/api/logs/stream?session=${encodeURIComponent(sessionId)}&token=${token}`
        : `/api/logs/stream?session=${encodeURIComponent(sessionId)}`;

      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setStatus("Connected");
      };

      eventSource.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs((prev) => {
            const newLogs = [entry, ...prev].slice(0, 500);
            return newLogs;
          });
        } catch {
          // ignore malformed SSE messages
        }
      };

      eventSource.onerror = () => {
        setStatus("Disconnected");
        eventSource?.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [sessionId]);

  return { upstreamUrl, setUpstreamUrl, logs, clearLogs, status, sessionId };
}
