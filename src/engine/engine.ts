// src/engine/engine.ts
// Общий дискретно-событийный движок (в духе блоков GPSS: генерация -> очередь -> захват
// ресурса -> задержка -> освобождение -> маршрутизация), полностью управляемый конфигом
// сценария (src/domain/types.ts). Симуляция считается «от и до» на заданную длительность
// (durationHours), результат — лог событий и статистика, которые UI воспроизводит уже
// в реальном времени с управляемой скоростью (см. store/simStore.ts).
import type { Edge, EntityKind, FlowDir, Scenario, SimEntity, Station } from '../domain/types';
import { transformOnComplete } from '../domain/behaviors';
import { createRng, sample, type Rng } from './rng';
import { EventHeap } from './heap';

export type TransitionType = 'arriveQueue' | 'startService' | 'leave';

export interface TransitionEvent {
  entityId: string;
  entityKind: EntityKind;
  flow: FlowDir;
  stationId: string;
  type: TransitionType;
  t: number;
}

export interface ExitRecord {
  stationId: string;
  entityKind: EntityKind;
  flow: FlowDir;
  destination?: string;
  condition?: string;
  t: number;
  flowTime: number; // t - createdAt
}

export interface StationSeriesPoint {
  t: number;
  queue: number;
  busy: number;
}

export interface StationStats {
  series: StationSeriesPoint[];
  waitSamples: number[]; // enterService - enterQueue, часы
  serviceSamples: number[]; // leave - enterService, часы
  blocked: number;
  throughputCount: number; // сколько раз завершился цикл обслуживания
}

export interface TravelSegment {
  entityId: string;
  entityKind: EntityKind;
  flow: FlowDir;
  from: string;
  to: string;
  t1: number;
  t2: number;
}

export interface SimStats {
  exits: ExitRecord[];
  restocks: number; // возвраты в хорошем состоянии, дошедшие обратно до storage
  byStation: Record<string, StationStats>;
  transitions: TransitionEvent[];
  travelSegments: TravelSegment[]; // для анимации токенов между станциями
  eventCap: boolean; // true, если упёрлись в лимит событий (сим мог быть незавершён)
}

export interface SimResult {
  scenario: Scenario;
  stats: SimStats;
  endTime: number;
}

interface QueueEntry {
  entity: SimEntity;
  enterQueue: number;
}

const MAX_EVENTS = 300_000;
const DEFAULT_TRAVEL = { kind: 'const' as const, value: 0.02 }; // ~1.2 минуты модельного времени

type EngineEvent =
  | { kind: 'arrival'; stationId: string }
  | { kind: 'travelArrive'; stationId: string; entity: SimEntity }
  | { kind: 'serviceComplete'; stationId: string; batch: SimEntity[] };

export function runSimulation(scenario: Scenario): SimResult {
  const rng: Rng = createRng(scenario.seed);
  const heap = new EventHeap<EngineEvent>();
  const stationsById = new Map<string, Station>(scenario.stations.map((s) => [s.id, s]));
  const edgesByFrom = new Map<string, Edge[]>();
  for (const e of scenario.edges) {
    const arr = edgesByFrom.get(e.from) ?? [];
    arr.push(e);
    edgesByFrom.set(e.from, arr);
  }

  const queues = new Map<string, QueueEntry[]>();
  const busy = new Map<string, number>();
  for (const s of scenario.stations) {
    queues.set(s.id, []);
    busy.set(s.id, 0);
  }

  const byStation: Record<string, StationStats> = {};
  for (const s of scenario.stations) {
    byStation[s.id] = { series: [], waitSamples: [], serviceSamples: [], blocked: 0, throughputCount: 0 };
  }
  const exits: ExitRecord[] = [];
  const transitions: TransitionEvent[] = [];
  const travelSegments: TravelSegment[] = [];
  let restocks = 0;
  let eventCap = false;

  let idCounter = 0;
  const nextId = () => `e${idCounter++}`;

  let now = 0;
  const recordSeries = (stationId: string) => {
    byStation[stationId].series.push({ t: now, queue: queues.get(stationId)!.length, busy: busy.get(stationId)! });
  };
  const recordTransition = (entity: SimEntity, stationId: string, type: TransitionType) => {
    transitions.push({ entityId: entity.id, entityKind: entity.kind, flow: entity.flow, stationId, type, t: now });
  };

  function pickEdge(stationId: string, entity: SimEntity): Edge | undefined {
    const candidates = (edgesByFrom.get(stationId) ?? []).filter((e) => {
      const w = e.when;
      if (!w) return true;
      if (w.flow && w.flow !== entity.flow) return false;
      if (w.sortType && w.sortType !== entity.sortType) return false;
      if (w.destination && w.destination !== entity.destination) return false;
      if (w.condition && w.condition !== entity.condition) return false;
      if (w.kind && w.kind !== entity.kind) return false;
      return true;
    });
    if (candidates.length === 0) return undefined;
    const totalWeight = candidates.reduce((s, e) => s + Math.max(0, e.weight), 0) || 1;
    let r = rng() * totalWeight;
    for (const e of candidates) {
      r -= Math.max(0, e.weight);
      if (r <= 0) return e;
    }
    return candidates[candidates.length - 1];
  }

  function routeEntity(fromStationId: string, entity: SimEntity): void {
    const edge = pickEdge(fromStationId, entity);
    if (!edge) {
      const fromStation = stationsById.get(fromStationId)!;
      if (fromStation.type === 'storage' && entity.flow === 'ret' && entity.condition === 'good') {
        restocks++;
      }
      exits.push({
        stationId: fromStationId,
        entityKind: entity.kind,
        flow: entity.flow,
        destination: entity.destination,
        condition: entity.condition,
        t: now,
        flowTime: now - entity.createdAt,
      });
      return;
    }
    const travel = edge.travelTime ?? DEFAULT_TRAVEL;
    const t2 = now + sample(travel, rng);
    travelSegments.push({ entityId: entity.id, entityKind: entity.kind, flow: entity.flow, from: fromStationId, to: edge.to, t1: now, t2 });
    heap.push(t2, { kind: 'travelArrive', stationId: edge.to, entity });
  }

  function tryStart(stationId: string): void {
    const station = stationsById.get(stationId)!;
    const q = queues.get(stationId)!;
    const cap = station.common.resourceCount;
    const batchIn = Math.max(1, station.common.batchIn);
    while ((busy.get(stationId) ?? 0) < cap && q.length >= batchIn) {
      const consumed = q.splice(0, batchIn);
      busy.set(stationId, (busy.get(stationId) ?? 0) + 1);
      const st = byStation[stationId];
      for (const c of consumed) {
        recordTransition(c.entity, stationId, 'startService');
        st.waitSamples.push(now - c.enterQueue);
      }
      recordSeries(stationId);
      const dur = sample(station.common.serviceTime, rng);
      st.serviceSamples.push(dur);
      heap.push(now + dur, { kind: 'serviceComplete', stationId, batch: consumed.map((c) => c.entity) });
    }
  }

  // Инициализация источников
  for (const s of scenario.stations) {
    if (s.type === 'sourceForward' || s.type === 'sourceReturn') {
      heap.push(sample(s.source!.interarrival, rng), { kind: 'arrival', stationId: s.id });
    }
  }

  let processed = 0;
  while (heap.size > 0) {
    const item = heap.pop()!;
    if (item.time > scenario.durationHours) break;
    now = item.time;
    processed++;
    if (processed > MAX_EVENTS) {
      eventCap = true;
      break;
    }
    const ev = item.payload;
    if (ev.kind === 'arrival') {
      const station = stationsById.get(ev.stationId)!;
      const isReturn = station.type === 'sourceReturn';
      const units = Math.max(1, Math.round(sample(station.source!.unitsPerTruck, rng)));
      let sortType: SimEntity['sortType'];
      if (!isReturn) {
        const r = rng();
        const crossdockShare = station.source!.crossdockShare ?? 0;
        const nonsortShare = station.source!.nonsortShare;
        if (r < crossdockShare) sortType = 'crossdock';
        else if (r < crossdockShare + nonsortShare) sortType = 'nonsort';
        else sortType = 'sort';
      }
      const entity: SimEntity = {
        id: nextId(),
        kind: isReturn ? 'returnTruck' : 'truck',
        flow: isReturn ? 'ret' : 'fwd',
        sortType,
        unitsPerTruck: units,
        createdAt: now,
        history: [],
      };
      routeEntity(ev.stationId, entity);
      heap.push(now + sample(station.source!.interarrival, rng), { kind: 'arrival', stationId: ev.stationId });
    } else if (ev.kind === 'travelArrive') {
      const station = stationsById.get(ev.stationId)!;
      const q = queues.get(ev.stationId)!;
      if (station.common.queueCapacity !== undefined && q.length >= station.common.queueCapacity) {
        byStation[ev.stationId].blocked++;
        continue;
      }
      q.push({ entity: ev.entity, enterQueue: now });
      recordTransition(ev.entity, ev.stationId, 'arriveQueue');
      recordSeries(ev.stationId);
      tryStart(ev.stationId);
    } else if (ev.kind === 'serviceComplete') {
      busy.set(ev.stationId, (busy.get(ev.stationId) ?? 0) - 1);
      const station = stationsById.get(ev.stationId)!;
      const st = byStation[ev.stationId];
      st.throughputCount++;
      for (const e of ev.batch) {
        recordTransition(e, ev.stationId, 'leave');
      }
      recordSeries(ev.stationId);
      const outputs = transformOnComplete(station, ev.batch, rng, nextId, now);
      for (const out of outputs) routeEntity(ev.stationId, out);
      tryStart(ev.stationId);
    }
  }

  return {
    scenario,
    stats: { exits, restocks, byStation, transitions, travelSegments, eventCap },
    endTime: Math.min(now, scenario.durationHours),
  };
}
