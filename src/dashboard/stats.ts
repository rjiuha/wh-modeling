// src/dashboard/stats.ts
// Свёртка сырого результата симуляции в метрики для дашборда: сводные счётчики, средние
// времена ожидания/обслуживания, загрузка ресурсов по станциям, временные ряды очередей.
import type { SimResult } from '../engine/engine';
import { STATION_LABELS } from '../domain/types';

export interface StationSummary {
  id: string;
  name: string;
  typeLabel: string;
  avgWaitMin: number;
  avgServiceMin: number;
  utilizationPct: number;
  throughputCount: number;
  blocked: number;
  maxQueue: number;
}

export interface OutboundTotals {
  shippedTruck: number;
  shippedCourier: number; // маршрутных листов сформировано
  writtenOff: number;
  restocked: number;
  trucksArrivedFwd: number;
  trucksArrivedRet: number;
}

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export function summarizeStations(result: SimResult): StationSummary[] {
  const { scenario, stats } = result;
  return scenario.stations.map((s) => {
    const st = stats.byStation[s.id];
    const busyHours = avg(st.serviceSamples) * st.throughputCount;
    const capacityHours = s.common.resourceCount * result.endTime;
    return {
      id: s.id,
      name: s.name,
      typeLabel: STATION_LABELS[s.type],
      avgWaitMin: avg(st.waitSamples) * 60,
      avgServiceMin: avg(st.serviceSamples) * 60,
      utilizationPct: capacityHours > 0 ? Math.min(100, (busyHours / capacityHours) * 100) : 0,
      throughputCount: st.throughputCount,
      blocked: st.blocked,
      maxQueue: st.series.reduce((m, p) => Math.max(m, p.queue), 0),
    };
  });
}

export function outboundTotals(result: SimResult): OutboundTotals {
  const { exits, transitions } = result.stats;
  const trucksArrivedFwd = transitions.filter((t) => t.type === 'arriveQueue' && t.entityKind === 'truck').length;
  const trucksArrivedRet = transitions.filter((t) => t.type === 'arriveQueue' && t.entityKind === 'returnTruck').length;
  let shippedTruck = 0;
  let shippedCourier = 0;
  let writtenOff = 0;
  for (const e of exits) {
    const station = result.scenario.stations.find((s) => s.id === e.stationId);
    if (!station) continue;
    if (station.type === 'shipTruck') shippedTruck++;
    else if (station.type === 'shipCourier') shippedCourier++;
    else if (station.type === 'utilization') writtenOff++;
  }
  return {
    shippedTruck,
    shippedCourier,
    writtenOff,
    restocked: result.stats.restocks,
    trucksArrivedFwd,
    trucksArrivedRet,
  };
}

export interface SeriesPoint {
  tLabel: string;
  t: number;
  queue: number;
}

export function downsampleQueueSeries(result: SimResult, stationId: string, maxPoints = 200): SeriesPoint[] {
  const series = result.stats.byStation[stationId]?.series ?? [];
  if (series.length === 0) return [];
  const step = Math.max(1, Math.floor(series.length / maxPoints));
  const out: SeriesPoint[] = [];
  for (let i = 0; i < series.length; i += step) {
    const p = series[i];
    out.push({ t: p.t, tLabel: p.t.toFixed(1), queue: p.queue });
  }
  const last = series[series.length - 1];
  if (out[out.length - 1]?.t !== last.t) out.push({ t: last.t, tLabel: last.t.toFixed(1), queue: last.queue });
  return out;
}
