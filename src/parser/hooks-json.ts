export interface HookEntry {
  event: string;
  matcher?: string;
  command?: string;
  type?: string;
  raw: unknown;
}

export interface ParsedHooks {
  entries: HookEntry[];
  raw: unknown;
}

export function parseHooksJson(raw: string): ParsedHooks {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { entries: [], raw: null };
  }

  const entries: HookEntry[] = [];

  if (json && typeof json === 'object' && 'hooks' in json) {
    const hooks = (json as { hooks: unknown }).hooks;
    if (hooks && typeof hooks === 'object') {
      for (const [event, value] of Object.entries(hooks as Record<string, unknown>)) {
        collectHookGroup(event, value, entries);
      }
    }
  }

  return { entries, raw: json };
}

function collectHookGroup(event: string, value: unknown, out: HookEntry[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const matcher = typeof obj.matcher === 'string' ? obj.matcher : undefined;
        const innerHooks = obj.hooks;
        if (Array.isArray(innerHooks)) {
          for (const h of innerHooks) {
            pushHook(event, matcher, h, out);
          }
        } else {
          pushHook(event, matcher, item, out);
        }
      }
    }
  } else if (value && typeof value === 'object') {
    pushHook(event, undefined, value, out);
  }
}

function pushHook(event: string, matcher: string | undefined, item: unknown, out: HookEntry[]): void {
  if (!item || typeof item !== 'object') return;
  const obj = item as Record<string, unknown>;
  out.push({
    event,
    matcher,
    type: typeof obj.type === 'string' ? obj.type : undefined,
    command: typeof obj.command === 'string' ? obj.command : undefined,
    raw: item,
  });
}
