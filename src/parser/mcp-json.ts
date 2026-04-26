export interface McpServerSpec {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  description?: string;
  raw: unknown;
}

export interface ParsedMcp {
  servers: McpServerSpec[];
  raw: unknown;
}

export function parseMcpJson(raw: string): ParsedMcp {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { servers: [], raw: null };
  }

  const servers: McpServerSpec[] = [];
  if (json && typeof json === 'object' && 'mcpServers' in json) {
    const mcpServers = (json as { mcpServers: unknown }).mcpServers;
    if (mcpServers && typeof mcpServers === 'object') {
      for (const [name, value] of Object.entries(mcpServers as Record<string, unknown>)) {
        if (value && typeof value === 'object') {
          const v = value as Record<string, unknown>;
          servers.push({
            name,
            command: typeof v.command === 'string' ? v.command : undefined,
            args: Array.isArray(v.args) ? v.args.filter((a): a is string => typeof a === 'string') : undefined,
            env: isStringRecord(v.env) ? v.env : undefined,
            url: typeof v.url === 'string' ? v.url : undefined,
            description: typeof v.description === 'string' ? v.description : undefined,
            raw: value,
          });
        }
      }
    }
  }
  return { servers, raw: json };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object') return false;
  for (const val of Object.values(v as Record<string, unknown>)) {
    if (typeof val !== 'string') return false;
  }
  return true;
}
