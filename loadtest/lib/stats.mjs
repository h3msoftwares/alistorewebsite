// Latency/error recorder + percentile math for the load harness.

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

export class Recorder {
  constructor() {
    this.samples = []; // { tag, status, ms, bytes, ok, timedOut, t }
    this.startedAt = null;
    this.endedAt = null;
  }
  start() { this.startedAt = performance.now(); }
  stop() { this.endedAt = performance.now(); }

  add(r) {
    this.samples.push({
      tag: r.tag, status: r.status, ms: r.ms, bytes: r.bytes || 0,
      ok: !!r.ok, timedOut: !!r.timedOut, t: performance.now(),
    });
  }

  _agg(rows) {
    const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
    const n = rows.length;
    const fails = rows.filter((r) => !r.ok).length;
    const tos = rows.filter((r) => r.timedOut).length;
    const bytes = rows.reduce((s, r) => s + r.bytes, 0);
    const wallSec = (this.endedAt && this.startedAt ? this.endedAt - this.startedAt : 1) / 1000;
    return {
      count: n,
      rps: +(n / Math.max(wallSec, 0.001)).toFixed(2),
      errPct: +((fails / Math.max(n, 1)) * 100).toFixed(3),
      timeoutPct: +((tos / Math.max(n, 1)) * 100).toFixed(3),
      mean: +(lat.reduce((s, x) => s + x, 0) / Math.max(n, 1)).toFixed(1),
      p50: +pct(lat, 50).toFixed(1),
      p90: +pct(lat, 90).toFixed(1),
      p95: +pct(lat, 95).toFixed(1),
      p99: +pct(lat, 99).toFixed(1),
      max: +(lat[lat.length - 1] || 0).toFixed(1),
      bytesMean: Math.round(bytes / Math.max(n, 1)),
      bytesTotal: bytes,
    };
  }

  overall() { return this._agg(this.samples); }

  byTag() {
    const tags = [...new Set(this.samples.map((s) => s.tag))].sort();
    const out = {};
    for (const t of tags) out[t] = this._agg(this.samples.filter((s) => s.tag === t));
    return out;
  }

  /** status-code histogram (incl. 0 = transport error) */
  statusHist() {
    const h = {};
    for (const s of this.samples) h[s.status] = (h[s.status] || 0) + 1;
    return h;
  }

  summary(label = '') {
    const o = this.overall();
    const lines = [];
    lines.push(`\n=== ${label || 'results'} ===`);
    lines.push(`requests   : ${o.count}  (${o.rps}/s)   errors ${o.errPct}%   timeouts ${o.timeoutPct}%`);
    lines.push(`latency ms : mean ${o.mean}  p50 ${o.p50}  p90 ${o.p90}  p95 ${o.p95}  p99 ${o.p99}  max ${o.max}`);
    lines.push(`resp bytes : mean ${o.bytesMean}  total ${(o.bytesTotal / 1e6).toFixed(2)} MB`);
    lines.push(`status     : ${JSON.stringify(this.statusHist())}`);
    lines.push(`per-endpoint:`);
    const bt = this.byTag();
    const pad = (s, n) => String(s).padEnd(n);
    lines.push(`  ${pad('tag', 34)} ${pad('n', 7)} ${pad('rps', 8)} ${pad('p50', 8)} ${pad('p95', 9)} ${pad('p99', 9)} ${pad('max', 9)} err%`);
    for (const [t, a] of Object.entries(bt)) {
      lines.push(`  ${pad(t, 34)} ${pad(a.count, 7)} ${pad(a.rps, 8)} ${pad(a.p50, 8)} ${pad(a.p95, 9)} ${pad(a.p99, 9)} ${pad(a.max, 9)} ${a.errPct}`);
    }
    return lines.join('\n');
  }

  /** Bucket samples into fixed wall-clock windows (seconds) for drift analysis. */
  windows(sec = 60) {
    if (!this.startedAt) return [];
    const w = sec * 1000;
    const buckets = new Map();
    for (const s of this.samples) {
      const k = Math.floor((s.t - this.startedAt) / w);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, rows]) => {
      const saved = { s: this.samples, st: this.startedAt, en: this.endedAt };
      this.samples = rows; this.startedAt = 0; this.endedAt = w;
      const a = this._agg(rows);
      this.samples = saved.s; this.startedAt = saved.st; this.endedAt = saved.en;
      return { windowIndex: k, fromSec: k * sec, ...a };
    });
  }

  toJSON(meta = {}) {
    return { meta, overall: this.overall(), byTag: this.byTag(), statusHist: this.statusHist() };
  }
}
