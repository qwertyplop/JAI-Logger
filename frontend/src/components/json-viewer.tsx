import React, { useMemo } from "react";

interface JsonViewerProps {
  data: string | null;
  className?: string;
}

const highlightJson = (json: string) => {
  if (!json) return "";
  
  const parsed = (() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    // If invalid JSON, return raw text encoded safely
    return json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const formatted = JSON.stringify(parsed, null, 2);
  
  // Highlighting regex
  return formatted.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
    let cls = "text-foreground";
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = "text-primary"; // key
        // remove the colon for highlighting, add it back outside span
        return `<span class="${cls}">${match.slice(0, -1)}</span>:`;
      } else {
        cls = "text-green-400"; // string
      }
    } else if (/true|false/.test(match)) {
      cls = "text-blue-400"; // boolean
    } else if (/null/.test(match)) {
      cls = "text-gray-500 italic"; // null
    } else {
      cls = "text-orange-400"; // number
    }
    return `<span class="${cls}">${match}</span>`;
  });
};

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, className = "" }) => {
  const highlighted = useMemo(() => highlightJson(data || ""), [data]);
  
  return (
    <pre className={`bg-card text-card-foreground border border-card-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all ${className}`} dangerouslySetInnerHTML={{ __html: highlighted || "null" }} />
  );
};
