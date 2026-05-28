import { useEffect, useState } from "react";

export function useServerHealthCheck() {
  const [downServers, setDownServers] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/demo-status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const down = (data.servers || []).filter((s) => !s.up);
        setDownServers(down);
      })
      .catch(() => {
        if (cancelled) return;
        setDownServers([
          {
            name: "Banking API Server",
            key: "api_server",
            up: false,
            startCmd: "cd banking_api_server && npm start",
            description: "Express BFF",
            port: 3001,
          },
          {
            name: "Banking MCP Server",
            key: "mcp_server",
            up: false,
            startCmd: "cd banking_mcp_server && npm run dev",
            description: "MCP tool server",
            port: 8080,
          },
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { downServers, setDownServers };
}
