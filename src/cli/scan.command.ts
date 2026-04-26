import { scanRepo } from '../scanner/orchestrator.ts';
import { renderReport, isUnsafe } from '../reporter/terminal.ts';
import { renderJson } from '../reporter/json.ts';
import { upsertEntry } from '../state/registry.ts';
import { appendHistory } from '../state/history.ts';
import type { RegistryEntry } from '../state/types.ts';

interface ScanCommandOptions {
  json?: boolean;
  noSave?: boolean;
}

export async function runScanCommand(url: string, opts: ScanCommandOptions, version: string): Promise<number> {
  const isJson = opts.json === true;
  if (!isJson) {
    process.stderr.write(`▸ ${url} 검사 중\n`);
  }

  let result;
  try {
    result = await scanRepo(url, {
      onStage: isJson ? undefined : (stage, info) => {
        process.stderr.write(`  · ${stage}${info ? ` — ${info}` : ''}\n`);
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`✗ 검사 실패: ${msg}\n`);
    return 2;
  }

  const { report, fileHashes } = result;
  const unsafe = isUnsafe(report);

  if (isJson) {
    process.stdout.write(renderJson(report) + '\n');
  } else {
    process.stdout.write('\n' + renderReport(report, version) + '\n');
  }

  if (opts.noSave !== true) {
    const entry: RegistryEntry = {
      id: report.pluginId,
      source: report.source,
      pluginName: report.pluginName,
      pluginType: report.pluginType,
      version: report.pluginVersion,
      fileHashes,
      lastScannedAt: report.scannedAt,
      status: unsafe ? 'unsafe' : 'clean',
      findingCount: report.highSurfaceSummary,
    };
    try {
      upsertEntry(entry);
      appendHistory({
        id: report.pluginId,
        pluginName: report.pluginName,
        source: report.source,
        scannedAt: report.scannedAt,
        status: unsafe ? 'unsafe' : 'clean',
        findingCount: report.highSurfaceSummary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`! 레지스트리 업데이트 실패: ${msg}\n`);
    }
  }

  return unsafe ? 1 : 0;
}
