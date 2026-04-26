import matter from 'gray-matter';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  try {
    const parsed = matter(raw);
    return {
      data: (parsed.data ?? {}) as Record<string, unknown>,
      body: parsed.content ?? '',
    };
  } catch {
    return { data: {}, body: raw };
  }
}
