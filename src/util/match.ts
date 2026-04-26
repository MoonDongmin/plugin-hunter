export interface LineMatch {
  lineNumber: number;
  snippet: string;
}

export function matchLines(content: string, regex: RegExp): LineMatch[] {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const lines = content.split(/\r?\n/);
  const out: LineMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    re.lastIndex = 0;
    if (re.test(line)) {
      out.push({ lineNumber: i + 1, snippet: line.trim().slice(0, 200) });
    }
  }
  return out;
}

export function matchMultiline(content: string, regex: RegExp): LineMatch[] {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const out: LineMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const upTo = content.slice(0, m.index);
    const lineNumber = upTo.split(/\r?\n/).length;
    const snippet = m[0].replace(/\s+/g, ' ').trim().slice(0, 200);
    out.push({ lineNumber, snippet });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}
