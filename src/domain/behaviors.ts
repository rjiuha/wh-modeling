// src/domain/behaviors.ts
// Единственное место, где «физика» конкретного типа станции превращает пришедшие на вход
// сущности в исходящие (смена атрибутов, разворот грузовика в единицы, упаковка партии в 1
// контейнер и т.д.). Маршрутизация между станциями остаётся общей и полностью настраивается
// рёбрами графа (см. engine/engine.ts) — здесь только трансформация сущностей.
import type { Destination, DestinationMix, SimEntity, Station } from './types';
import { type Rng } from '../engine/rng';

function pickDestination(mix: DestinationMix | undefined, rng: Rng): Destination {
  const m = mix ?? { local: 1, truck: 0 };
  const total = m.local + m.truck || 1;
  const r = rng() * total;
  return r < m.local ? 'local' : 'truck';
}

function childOf(id: string, parent: SimEntity, overrides: Partial<SimEntity>, now: number): SimEntity {
  return {
    id,
    kind: parent.kind,
    flow: parent.flow,
    sortType: parent.sortType,
    destination: parent.destination,
    condition: parent.condition,
    unitsPerTruck: parent.unitsPerTruck,
    createdAt: now,
    history: [],
    ...overrides,
  };
}

export function transformOnComplete(
  station: Station,
  consumed: SimEntity[],
  rng: Rng,
  nextId: () => string,
  now: number,
): SimEntity[] {
  switch (station.type) {
    case 'gate':
    case 'returnsGate': {
      // Разгрузка: каждый грузовик разворачивается в N грузовых единиц (nonsort/sort/возврат).
      const out: SimEntity[] = [];
      for (const truck of consumed) {
        const n = Math.max(1, Math.round(truck.unitsPerTruck ?? 1));
        for (let i = 0; i < n; i++) {
          out.push(childOf(nextId(), truck, { kind: truck.flow === 'ret' ? 'returnUnit' : 'unit' }, now));
        }
      }
      return out;
    }
    case 'sort': {
      return consumed.map((e) => {
        const mix = e.sortType === 'nonsort' ? station.sort?.nonsortDestinationMix : station.sort?.sortDestinationMix;
        return { ...e, destination: pickDestination(mix, rng) };
      });
    }
    case 'returnsInspect': {
      const damagedShare = station.returnsInspect?.damagedShare ?? 0.1;
      return consumed.map((e) => ({ ...e, condition: rng() < damagedShare ? 'damaged' : 'good' }));
    }
    case 'mobileContainer': {
      // Несколько упаковок объединяются в 1 мобильный контейнер — его целиком заберёт курьер.
      if (consumed.length === 0) return [];
      return [childOf(nextId(), consumed[0], { kind: 'mobileContainer' }, now)];
    }
    case 'palletize': {
      // Несколько грузовых единиц формируются в 1 паллету под погрузку в грузовик.
      if (consumed.length === 0) return [];
      return [childOf(nextId(), consumed[0], { kind: 'pallet' }, now)];
    }
    case 'shipTruck':
    case 'shipCourier':
    case 'storage':
    case 'returnsGate':
    case 'utilization':
    case 'sourceForward':
    default:
      return consumed;
  }
}
