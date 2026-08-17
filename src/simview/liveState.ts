// src/simview/liveState.ts
// Вспомогательные функции для «прокрутки» уже посчитанного результата симуляции на момент
// virtualTime: живые счётчики очереди/занятости по станциям и токены в пути между станциями.
import type { SimResult, StationSeriesPoint, TravelSegment } from '../engine/engine';

function lastAtOrBefore<T extends { t: number }>(arr: T[], t: number): T | undefined {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? arr[ans] : undefined;
}

export function stationLiveCounts(result: SimResult, t: number): Record<string, { queue: number; busy: number }> {
  const out: Record<string, { queue: number; busy: number }> = {};
  for (const s of result.scenario.stations) {
    const series: StationSeriesPoint[] = result.stats.byStation[s.id]?.series ?? [];
    const p = lastAtOrBefore(series, t);
    out[s.id] = p ? { queue: p.queue, busy: p.busy } : { queue: 0, busy: 0 };
  }
  return out;
}

const LOOKBACK = 4000;

export function activeTravelTokens(result: SimResult, t: number): TravelSegment[] {
  const segs = result.stats.travelSegments;
  let lo = 0;
  let hi = segs.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].t1 <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const out: TravelSegment[] = [];
  for (let i = idx, count = 0; i >= 0 && count < LOOKBACK; i--, count++) {
    const seg = segs[i];
    if (seg.t1 <= t && seg.t2 >= t) out.push(seg);
  }
  return out;
}
