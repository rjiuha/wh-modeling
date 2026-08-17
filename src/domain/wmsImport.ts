// src/domain/wmsImport.ts
// Генератор сценария конфигуратора из реальной выгрузки WMS (см. переписку в сессии по разбору
// «Схема склада.json» и «Схема рекомендаций.json»).
//
// «Схема склада.json» — плоский словарь тысяч физических ячеек (Zone/Site/Container) с тегами и
// geometry. Это НЕ граф процесса, а склад-снимок физической структуры, поэтому агрегируем ячейки
// по тегам/subType в компактный набор станций (не более одной станции на тип), а не пытаемся
// воспроизвести реальную геометрию.
//
// «Схема рекомендаций.json» оказалась движком РАЗМЕЩЕНИЯ (какая ячейка/аллея/контейнер), а не
// маршрутизации по этапам процесса — ни один из типов рекомендаций не говорит «уезжает грузовиком
// vs остаётся локально», так что построить из него рёбра (edges) между станциями напрямую нельзя.
// Используем его только для трёх узких статистик, которые реально читаются из дерева: доля брака
// (MoveToUtilizationCell), доля кросс-дока (ветки IsTransitWarehouse=True) и грубая оценка доли
// нонсорта (по ArticleCategory). Подробности и обоснование — в плане сессии.
import type { Scenario, Station, StationType } from './types';
import { STATION_LABELS, StationTypes } from './types';
import { buildEdgesFromTemplate } from './defaultScenario';
import { defaultStationParams } from '../store/scenarioStore';

// ---- Устойчивый парсинг: у пользовательского файла рекомендаций после основного JSON-документа
// оказались лишние данные ("Extra data" при обычном JSON.parse) — откусываем первый валидный
// сбалансированный {...} и парсим только его.
export function parseLeadingJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    const start = text.indexOf('{');
    if (start === -1) throw err;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(text.slice(start, i + 1));
      }
    }
    throw err;
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ---- Схема склада: тег -> тип станции (порядок важен, первое совпадение среди тегов ячейки побеждает).
const TAG_STATION_MAP: [string, StationType][] = [
  ['AcceptanceGate', 'gate'],
  ['gate', 'gate'],
  ['GateBufferPersonal', 'gate'],
  ['GateBufferReserve', 'gate'],
  ['1stepBufferInput', 'gate'],
  ['DirectoryWHWorkingZoneIncome', 'gate'],
  ['GlobalInputCell', 'gate'],
  ['DirectoryWHUniversalAutoincome', 'gate'],

  ['StationBufferSort', 'sort'],
  ['StationBufferNonSort', 'sort'],
  ['FirstSortingZone', 'sort'],
  ['LastSortingZone', 'sort'],
  ['MultiLevelSortingZone', 'sort'],
  ['MixSortingZone', 'sort'],
  ['WmsSortingZone', 'sort'],
  ['1StepSort', 'sort'],
  ['1StepNonSort', 'sort'],
  ['2StepSortBufferInput', 'sort'],
  ['2StepSortBufferOutput', 'sort'],
  ['InSortingChamomileCell', 'sort'],
  ['AdditionalProcessing', 'sort'],
  ['PenaltySort', 'sort'],
  ['TrustSorting', 'sort'],
  ['HasSortingV2', 'sort'],
  ['FirstWorkingZoneSC', 'sort'],

  ['MusPalletAssemblyZone', 'palletize'],

  ['ContainerFillingCell', 'pack'],

  ['MobileContainerOnCell', 'mobileContainer'],
  ['MobileContainerBufferInput', 'mobileContainer'],
  ['DirectoryWHWorkingZoneCourierGiveOutPVZ', 'mobileContainer'],
  ['DirectoryWHWorkingZoneCourierGiveOut', 'mobileContainer'],
  ['GiveOutMKStream', 'mobileContainer'],

  ['DirectoryWHWorkingZoneShipment', 'shipTruck'],
  ['DirectoryTopologyWorkZoneDock', 'shipTruck'],
  ['DirectoryWHWorkingZoneOutgoingCargoBuffer', 'shipTruck'],

  ['DirectoryWHWorkingZoneKeeping', 'storage'],
  ['ZoneStorage', 'storage'],
  ['ClosedDstTareCell', 'storage'],
  ['ClosedTaresBufferCells', 'storage'],

  ['WrongPlaceItemCell', 'custom'],
  ['DefectiveItemCell', 'custom'],
  ['OversizedItemCell', 'custom'],
  ['ProblemSorted', 'custom'],
];

const SUBTYPE_STATION_FALLBACK: Partial<Record<string, StationType>> = {
  StorageCell: 'storage',
  Shelf: 'storage',
  ShelfRack: 'storage',
  Row: 'storage',
  Alley: 'storage',
  MobileContainer: 'mobileContainer',
  FillingRack: 'pack',
};

interface RawCell {
  subType?: string;
  tagNames?: string[];
}
interface RawWarehouseSchema {
  cells?: Record<string, RawCell>;
}

function classifyCell(cell: RawCell): StationType | null {
  const tags = cell.tagNames ?? [];
  for (const [tag, type] of TAG_STATION_MAP) {
    if (tags.includes(tag)) return type;
  }
  const fallback = cell.subType ? SUBTYPE_STATION_FALLBACK[cell.subType] : undefined;
  return fallback ?? null;
}

export interface WarehouseAggregation {
  counts: Partial<Record<StationType, number>>;
  totalCells: number;
  matchedCells: number;
}

export function aggregateWarehouseCells(raw: unknown): WarehouseAggregation {
  const data = raw as RawWarehouseSchema;
  if (!data?.cells || typeof data.cells !== 'object') {
    throw new Error('Не похоже на «Схему склада» — нет поля "cells".');
  }
  const cellList = Object.values(data.cells);
  const counts: Partial<Record<StationType, number>> = {};
  let matchedCells = 0;
  for (const cell of cellList) {
    const type = classifyCell(cell);
    if (type) {
      counts[type] = (counts[type] ?? 0) + 1;
      matchedCells++;
    }
  }
  return { counts, totalCells: cellList.length, matchedCells };
}

// ---- Схема рекомендаций: только три узкие статистики (см. шапку файла).
const NONSORT_CATEGORIES = ['Polybox', 'PlasticBag', 'ShoppingCart'];
const SORT_CATEGORIES = ['Pallet', 'RollCage', 'TarePallet'];
const SHARE_MIN = 0.02;
const SHARE_MAX = 0.6;
const clampShare = (v: number) => clamp(v, SHARE_MIN, SHARE_MAX);

interface RecLeaf {
  recType: string;
  context: Record<string, Set<string>>;
}

function walkRecommendations(nodes: unknown, context: Record<string, Set<string>>, leaves: RecLeaf[]): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    const n = raw as { type?: string; field?: { name?: string }; values?: { name?: string }[]; then?: unknown; recommendation?: { type?: string } };
    if (n?.type === 'If') {
      const fieldName = n.field?.name;
      const values = Array.isArray(n.values) ? n.values.map((v) => v?.name).filter((v): v is string => !!v) : [];
      const nextContext = { ...context };
      if (fieldName) {
        const prev = nextContext[fieldName] ?? new Set<string>();
        nextContext[fieldName] = new Set([...prev, ...values]);
      }
      walkRecommendations(n.then, nextContext, leaves);
    } else if (n?.type === 'Recommendation') {
      leaves.push({ recType: n.recommendation?.type ?? 'Unknown', context });
    } else if (n && typeof n === 'object' && 'then' in n) {
      walkRecommendations(n.then, context, leaves);
    }
  }
}

export interface RecShares {
  damagedShare: number;
  crossdockShare: number;
  nonsortShare: number;
  leafCount: number;
  notes: string[];
}

export function analyzeRecommendations(raw: unknown): RecShares {
  const data = raw as { graph?: unknown };
  if (!Array.isArray(data?.graph)) {
    throw new Error('Не похоже на «Схему рекомендаций» — нет поля "graph".');
  }

  const leaves: RecLeaf[] = [];
  walkRecommendations(data.graph, {}, leaves);
  const total = leaves.length;

  const damagedLeaves = leaves.filter((l) => l.recType === 'MoveToUtilizationCell').length;
  const crossdockLeaves = leaves.filter((l) => l.context['IsTransitWarehouse']?.has('True')).length;

  let nonsortCount = 0;
  let sortCount = 0;
  for (const leaf of leaves) {
    const cats = leaf.context['ArticleCategory'];
    if (!cats) continue;
    if (NONSORT_CATEGORIES.some((c) => cats.has(c))) nonsortCount++;
    else if (SORT_CATEGORIES.some((c) => cats.has(c))) sortCount++;
  }

  const damagedShare = total > 0 ? clampShare(damagedLeaves / total) : 0.15;
  const crossdockShare = total > 0 ? clampShare(crossdockLeaves / total) : 0.15;
  const nonsortShare = nonsortCount + sortCount > 0 ? clampShare(nonsortCount / (nonsortCount + sortCount)) : 0.4;

  return {
    damagedShare,
    crossdockShare,
    nonsortShare,
    leafCount: total,
    notes: [
      `Разобрано ${total} листьев дерева рекомендаций.`,
      `Доля брака (ветки MoveToUtilizationCell): ${Math.round(damagedShare * 100)}% (${damagedLeaves}/${total}).`,
      `Доля кросс-дока (ветки IsTransitWarehouse=True): ${Math.round(crossdockShare * 100)}% (${crossdockLeaves}/${total}).`,
      nonsortCount + sortCount > 0
        ? `Доля нонсорта по ArticleCategory (грубая оценка): ${Math.round(nonsortShare * 100)}% (${nonsortCount}/${nonsortCount + sortCount} размеченных листьев).`
        : `Веток с ArticleCategory не нашли — доля нонсорта оставлена по умолчанию (${Math.round(nonsortShare * 100)}%).`,
    ],
  };
}

// ---- Сборка сценария.
const STATION_LAYOUT: Partial<Record<StationType, { x: number; y: number; w?: number }>> = {
  sourceForward: { x: 30, y: 20 },
  gate: { x: 250, y: 20 },
  sort: { x: 470, y: 20 },
  storage: { x: 690, y: 20 },
  pack: { x: 910, y: 20 },
  mobileContainer: { x: 1090, y: 20, w: 190 },
  shipCourier: { x: 1300, y: 20 },
  palletize: { x: 690, y: 220 },
  shipTruck: { x: 940, y: 220 },
  sourceReturn: { x: 30, y: 440 },
  returnsGate: { x: 250, y: 440 },
  returnsInspect: { x: 470, y: 440 },
  utilization: { x: 690, y: 540 },
  custom: { x: 940, y: 440, w: 190 },
};

function deriveResourceCount(type: StationType, count: number): number {
  if (type === 'storage') return clamp(count, 1, 5000);
  return clamp(Math.round(count / 20), 1, 40);
}

export interface WmsImportResult {
  scenario: Scenario;
  summary: string[];
}

export function buildScenarioFromWarehouseSchema(warehouseRaw: unknown, recShares?: RecShares): WmsImportResult {
  const { counts, totalCells, matchedCells } = aggregateWarehouseCells(warehouseRaw);

  // В файле склада нет данных о трафике машин (это статический снимок структуры, не поток) —
  // источники и обратный поток всегда присутствуют с параметрами по умолчанию. Весь «хребет»
  // топологии (ворота..сортировка..хранение/паллетирование..упаковка/контейнеры..отгрузка) тоже
  // всегда присутствует, даже если под какой-то узел не нашлось тегов — иначе часть потока по
  // шаблону рёбер (buildEdgesFromTemplate) молча упирается в тупик (нет исходящего ребра — сущность
  // считается вышедшей из сценария, но не попадает ни в один канал отгрузки в статистике). Реальные
  // данные из ячеек всё равно проявляются через resourceCount ниже — станция без своих ячеек просто
  // остаётся с параметрами по умолчанию, а не пропадает.
  const present = new Set<StationType>(Object.keys(counts) as StationType[]);
  const BACKBONE: StationType[] = [
    'sourceForward',
    'sourceReturn',
    'gate',
    'sort',
    'storage',
    'pack',
    'mobileContainer',
    'shipCourier',
    'palletize',
    'shipTruck',
    'returnsGate',
    'returnsInspect',
    'utilization',
  ];
  for (const t of BACKBONE) present.add(t);

  const stations: Station[] = [];
  const typeToId: Partial<Record<StationType, string>> = {};

  for (const type of StationTypes) {
    if (!present.has(type)) continue;
    const layout = STATION_LAYOUT[type] ?? { x: 30, y: 640 };
    typeToId[type] = type;
    const count = counts[type] ?? 0;
    const params = defaultStationParams(type);
    if (count > 0) params.common = { ...params.common, resourceCount: deriveResourceCount(type, count) };
    if (type === 'sourceForward' && recShares && params.source) {
      params.source = { ...params.source, crossdockShare: recShares.crossdockShare, nonsortShare: recShares.nonsortShare };
    }
    if (type === 'returnsInspect' && recShares) {
      params.returnsInspect = { damagedShare: recShares.damagedShare };
    }
    stations.push({
      id: type,
      type,
      name: `${STATION_LABELS[type]}${count > 0 ? ` (${count} яч.)` : ''}`,
      x: layout.x,
      y: layout.y,
      w: layout.w ?? 170,
      h: 84,
      ...params,
    });
  }

  const edges = buildEdgesFromTemplate(typeToId);

  const summary = [
    `Разобрано ${totalCells} ячеек склада, классифицировано по назначению — ${matchedCells}.`,
    `Создано станций: ${stations.length} (связей: ${edges.length}).`,
    ...StationTypes.filter((t) => (counts[t] ?? 0) > 0).map((t) => {
      const st = stations.find((s) => s.id === t)!;
      return `«${STATION_LABELS[t]}»: ${counts[t]} ячеек → ${st.common.resourceCount}${t === 'storage' ? ' мест' : ' человек'}.`;
    }),
  ];

  const scenario: Scenario = {
    id: 'wms-import',
    name: 'Сценарий из выгрузки WMS',
    seed: 12345,
    durationHours: 24,
    stations,
    edges,
  };
  return { scenario, summary };
}
