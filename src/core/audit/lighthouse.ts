import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

export type PerfResult = {
  available: boolean;
  source: 'lighthouse' | 'response_timing';
  measurementKind: 'lab' | 'server_response';
  metrics: Record<string, number | string>;
  note: string;
};

/**
 * Lighthouse is an OPTIONAL adapter. It is not a LaunchOS dependency: it needs
 * a local Chrome install, so audits must work without it. When it is absent we
 * record the server response timing we did measure and say so plainly.
 */
export async function tryLighthouse(url: string, timeoutMs = 90_000): Promise<PerfResult | null> {
  const probe = await which('lighthouse');
  if (!probe) return null;
  try {
    const { stdout } = await run(
      probe,
      [url, '--output=json', '--quiet', '--chrome-flags=--headless=new --no-sandbox', '--only-categories=performance,accessibility,best-practices,seo'],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }
    );
    const r = JSON.parse(stdout) as {
      categories?: Record<string, { score: number | null }>;
      audits?: Record<string, { numericValue?: number; displayValue?: string }>;
    };
    const cat = (k: string) => {
      const s = r.categories?.[k]?.score;
      return typeof s === 'number' ? Math.round(s * 100) : -1;
    };
    const num = (k: string) => r.audits?.[k]?.numericValue ?? -1;
    return {
      available: true,
      source: 'lighthouse',
      measurementKind: 'lab',
      metrics: {
        performance: cat('performance'),
        accessibility: cat('accessibility'),
        best_practices: cat('best-practices'),
        seo: cat('seo'),
        lcp_ms: Math.round(num('largest-contentful-paint')),
        cls: Number(num('cumulative-layout-shift').toFixed(3)),
        tbt_ms: Math.round(num('total-blocking-time')),
        speed_index_ms: Math.round(num('speed-index')),
      },
      note:
        'Lab measurement from a single local Lighthouse run. Lab data is not field data: it reflects this machine and network, ' +
        'not your real users. Lighthouse scores are not a ranking factor — Core Web Vitals field data is the signal Google uses.',
    };
  } catch (e) {
    return {
      available: false,
      source: 'lighthouse',
      measurementKind: 'lab',
      metrics: {},
      note: `Lighthouse is installed but the run failed: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`,
    };
  }
}

export function responseTiming(elapsedMs: number, bytes: number): PerfResult {
  return {
    available: true,
    source: 'response_timing',
    measurementKind: 'server_response',
    metrics: { response_ms: elapsedMs, html_bytes: bytes },
    note:
      'Server response time and HTML size measured by the LaunchOS crawler. This is not a Core Web Vitals measurement ' +
      'and says nothing about rendering or layout stability. Install Lighthouse locally for lab metrics, and use the ' +
      'Chrome UX Report or Search Console for real-user field data.',
  };
}

async function which(bin: string): Promise<string | null> {
  try {
    const { stdout } = await run('which', [bin], { timeout: 4000 });
    const p = stdout.trim();
    return p || null;
  } catch {
    return null;
  }
}
