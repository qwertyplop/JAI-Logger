export interface LogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  durationMs: number;
  isStream: boolean;
  error: string | null;
}
