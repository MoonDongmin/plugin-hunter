import { JudgeParseError } from './types.ts';

export function extractJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenced?.[1]) return parseObject(fenced[1], raw);

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new JudgeParseError('No JSON object found in judge response.', raw);
  }

  return parseObject(raw.slice(start, end + 1), raw);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

export function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

export function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

export function readArray(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function parseObject(jsonText: string, raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!isRecord(parsed)) {
      throw new JudgeParseError('Judge response JSON is not an object.', raw);
    }
    return parsed;
  } catch (error) {
    if (error instanceof JudgeParseError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JudgeParseError(`Invalid JSON in judge response: ${message}`, raw);
  }
}
