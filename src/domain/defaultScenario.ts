// src/domain/defaultScenario.ts
// Сценарий-пример «из коробки»:
//  - прямой поток: грузовики -> ворота -> сортировка -> [нонсорт/сорт]
//      локальные -> хранение -> упаковка -> мобильные контейнеры -> отгрузка курьером
//      уезжающие грузовиком (не локально) -> паллетирование -> отгрузка грузовиком
//  - кросс-док: уже готовый (сконсолидированный) груз едет с ворот сразу на отгрузку грузовиком,
//    минуя сортировку и паллетирование — это буквально «из зоны приёмки в зону отгрузки»
//  - обратный поток: возврат/брак -> приём -> инспекция -> ресток (хранение) либо утилизация
// Время везде в часах модельного времени.
import type { Distribution, Edge, EdgeWhen, Scenario, Station, StationType } from './types';

const c = (value: number): Distribution => ({ kind: 'const', value });
const u = (min: number, max: number): Distribution => ({ kind: 'uniform', min, max });
const tri = (min: number, mode: number, max: number): Distribution => ({ kind: 'triangular', min, mode, max });
const exp = (mean: number): Distribution => ({ kind: 'exponential', mean });

function station(partial: Omit<Station, 'w' | 'h'> & { w?: number; h?: number }): Station {
  return { w: 170, h: 84, ...partial };
}

// Топология связей по умолчанию, заданная ТИПАМИ станций, а не конкретными id — так её может
// переиспользовать и обычный дефолтный сценарий, и генератор сценария из выгрузки WMS
// (src/domain/wmsImport.ts), у которого только часть типов может реально присутствовать.
export interface EdgeTemplateEntry {
  fromType: StationType;
  toType: StationType;
  when?: EdgeWhen;
  travelTime?: Distribution;
}

export const DEFAULT_EDGE_TEMPLATE: EdgeTemplateEntry[] = [
  { fromType: 'sourceForward', toType: 'gate' },
  // с ворот груз либо уходит на сортировку (сорт/нонсорт), либо — если это уже готовый
  // консолидированный груз (кросс-док) — едет напрямую в зону отгрузки транзитом.
  { fromType: 'gate', toType: 'sort', when: { sortType: 'sort' } },
  { fromType: 'gate', toType: 'sort', when: { sortType: 'nonsort' } },
  { fromType: 'gate', toType: 'shipTruck', when: { sortType: 'crossdock' }, travelTime: u(0.05, 0.15) },
  { fromType: 'sort', toType: 'storage', when: { destination: 'local' } },
  { fromType: 'sort', toType: 'palletize', when: { destination: 'truck' } },
  { fromType: 'storage', toType: 'pack', when: { flow: 'fwd' } },
  { fromType: 'pack', toType: 'mobileContainer' },
  { fromType: 'mobileContainer', toType: 'shipCourier' },
  { fromType: 'palletize', toType: 'shipTruck' },
  { fromType: 'sourceReturn', toType: 'returnsGate' },
  { fromType: 'returnsGate', toType: 'returnsInspect' },
  { fromType: 'returnsInspect', toType: 'storage', when: { condition: 'good' } },
  { fromType: 'returnsInspect', toType: 'utilization', when: { condition: 'damaged' } },
];

// Строит рёбра по шаблону для тех станций, что реально присутствуют в сценарии (typeToId — какой
// станции какого типа какой id присвоен); рёбра, для которых нет одной из сторон, пропускаются.
export function buildEdgesFromTemplate(typeToId: Partial<Record<StationType, string>>): Edge[] {
  const edges: Edge[] = [];
  let n = 0;
  for (const entry of DEFAULT_EDGE_TEMPLATE) {
    const from = typeToId[entry.fromType];
    const to = typeToId[entry.toType];
    if (!from || !to) continue;
    edges.push({ id: `e${++n}`, from, to, weight: 1, when: entry.when, travelTime: entry.travelTime });
  }
  return edges;
}

export function buildDefaultScenario(): Scenario {
  const stations: Station[] = [
    station({
      id: 'src_fwd',
      type: 'sourceForward',
      name: 'Приезд грузовиков',
      x: 30,
      y: 20,
      common: { resourceCount: 1, serviceTime: c(0), batchIn: 1 },
      source: { interarrival: exp(0.4), unitsPerTruck: u(20, 60), nonsortShare: 0.35, crossdockShare: 0.15 },
    }),
    station({
      id: 'gate',
      type: 'gate',
      name: 'Ворота (разгрузка)',
      x: 250,
      y: 20,
      common: { resourceCount: 3, serviceTime: tri(0.15, 0.3, 0.6), batchIn: 1, queueCapacity: 8 },
    }),
    station({
      id: 'sort',
      type: 'sort',
      name: 'Сортировка',
      x: 470,
      y: 20,
      common: { resourceCount: 6, serviceTime: tri(0.02, 0.05, 0.12), batchIn: 1 },
      sort: {
        nonsortDestinationMix: { local: 0.7, truck: 0.3 },
        sortDestinationMix: { local: 0.5, truck: 0.5 },
      },
    }),
    station({
      id: 'storage',
      type: 'storage',
      name: 'Временное хранение',
      x: 690,
      y: 20,
      common: { resourceCount: 400, serviceTime: u(0.5, 6), batchIn: 1 },
    }),
    station({
      id: 'pack',
      type: 'pack',
      name: 'Упаковка',
      x: 910,
      y: 20,
      common: { resourceCount: 4, serviceTime: tri(0.03, 0.06, 0.12), batchIn: 8 },
    }),
    station({
      id: 'mobile_container',
      type: 'mobileContainer',
      name: 'Формирование мобильных контейнеров',
      x: 1090,
      y: 20,
      w: 190,
      common: { resourceCount: 3, serviceTime: tri(0.02, 0.05, 0.1), batchIn: 4 },
    }),
    station({
      id: 'ship_courier',
      type: 'shipCourier',
      name: 'Отгрузка: курьер',
      x: 1300,
      y: 20,
      common: { resourceCount: 3, serviceTime: tri(0.03, 0.07, 0.15), batchIn: 2 },
    }),
    station({
      id: 'palletize',
      type: 'palletize',
      name: 'Паллетирование',
      x: 690,
      y: 220,
      common: { resourceCount: 3, serviceTime: tri(0.03, 0.06, 0.12), batchIn: 10 },
    }),
    station({
      id: 'ship_truck',
      type: 'shipTruck',
      name: 'Отгрузка: грузовик',
      x: 940,
      y: 220,
      common: { resourceCount: 2, serviceTime: tri(0.2, 0.4, 0.8), batchIn: 12 },
    }),
    station({
      id: 'src_ret',
      type: 'sourceReturn',
      name: 'Приезд возвратов/брака',
      x: 30,
      y: 440,
      common: { resourceCount: 1, serviceTime: c(0), batchIn: 1 },
      source: { interarrival: exp(1.2), unitsPerTruck: u(5, 20), nonsortShare: 0, crossdockShare: 0 },
    }),
    station({
      id: 'ret_gate',
      type: 'returnsGate',
      name: 'Приём возвратов',
      x: 250,
      y: 440,
      common: { resourceCount: 2, serviceTime: tri(0.1, 0.2, 0.4), batchIn: 1, queueCapacity: 8 },
    }),
    station({
      id: 'ret_inspect',
      type: 'returnsInspect',
      name: 'Инспекция возврата',
      x: 470,
      y: 440,
      common: { resourceCount: 2, serviceTime: u(0.02, 0.08), batchIn: 1 },
      returnsInspect: { damagedShare: 0.15 },
    }),
    station({
      id: 'utilization',
      type: 'utilization',
      name: 'Утилизация/списание',
      x: 690,
      y: 540,
      common: { resourceCount: 2, serviceTime: c(0.05), batchIn: 1 },
    }),
  ];

  const edges = buildEdgesFromTemplate({
    sourceForward: 'src_fwd',
    gate: 'gate',
    sort: 'sort',
    storage: 'storage',
    pack: 'pack',
    mobileContainer: 'mobile_container',
    shipCourier: 'ship_courier',
    palletize: 'palletize',
    shipTruck: 'ship_truck',
    sourceReturn: 'src_ret',
    returnsGate: 'ret_gate',
    returnsInspect: 'ret_inspect',
    utilization: 'utilization',
  });

  return {
    id: 'default',
    name: 'Типовой сценарий склада',
    seed: 12345,
    durationHours: 24,
    stations,
    edges,
  };
}
