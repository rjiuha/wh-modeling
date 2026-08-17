// src/domain/types.ts
// Центральная модель данных: сценарий склада (граф станций) + сущности симуляции.
// Схема НЕ повторяет формат реальных экспортов WMS (Схема склада.json / Схема рекомендаций.json) —
// это самостоятельная упрощённая модель для конфигуратора и DES-движка (см. src/engine).

export type DistributionKind = 'const' | 'uniform' | 'exponential' | 'normal' | 'triangular';

export type Distribution =
  | { kind: 'const'; value: number }
  | { kind: 'uniform'; min: number; max: number }
  | { kind: 'exponential'; mean: number }
  | { kind: 'normal'; mean: number; stdDev: number }
  | { kind: 'triangular'; min: number; mode: number; max: number };

export const StationTypes = [
  'sourceForward',
  'sourceReturn',
  'gate',
  'sort',
  'storage',
  'pack',
  'mobileContainer',
  'palletize',
  'shipTruck',
  'shipCourier',
  'returnsGate',
  'returnsInspect',
  'utilization',
  'custom',
] as const;
export type StationType = (typeof StationTypes)[number];

export type EntityKind =
  | 'truck'
  | 'unit'
  | 'container'
  | 'pallet'
  | 'mobileContainer'
  | 'returnUnit'
  | 'returnTruck';
export type FlowDir = 'fwd' | 'ret';
// 'crossdock' — уже готовый, консолидированный груз (например, палета с чужого склада), который
// не нужно вскрывать и пересортировывать: едет напрямую из зоны приёмки в зону отгрузки транзитом.
export type SortType = 'sort' | 'nonsort' | 'crossdock';
export type Destination = 'local' | 'truck';
export type Condition = 'good' | 'damaged';

export const SORT_TYPE_LABELS: Record<SortType, string> = {
  sort: 'сортовой (нужно вскрыть и пересортировать)',
  nonsort: 'нонсорт (россыпь)',
  crossdock: 'кросс-док / транзит (уже готовый груз, без обработки)',
};
export const DESTINATION_LABELS: Record<Destination, string> = {
  local: 'локальная выдача (этот склад)',
  truck: 'уезжает грузовиком (не локально)',
};
export const CONDITION_LABELS: Record<Condition, string> = { good: 'исправно', damaged: 'брак/повреждено' };
export const FLOW_LABELS: Record<FlowDir, string> = { fwd: 'прямой поток', ret: 'возврат' };
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  truck: 'грузовик',
  unit: 'грузовая единица',
  container: 'упаковка/короб',
  pallet: 'паллета',
  mobileContainer: 'мобильный контейнер',
  returnUnit: 'единица возврата',
  returnTruck: 'машина/партия возврата',
};

// Условие на исходящем ребре — сущность должна совпасть по всем указанным полям, чтобы ребро подошло.
export interface EdgeWhen {
  flow?: FlowDir;
  sortType?: SortType;
  destination?: Destination;
  condition?: Condition;
  kind?: EntityKind;
}

export interface Edge {
  id: string;
  from: string; // station id
  to: string; // station id, либо специальный узел 'exit' не используется — exit кодируется отсутствием outputs
  when?: EdgeWhen;
  weight: number; // относительный вес среди подходящих рёбер (для ветвления в процентах)
  travelTime?: Distribution; // визуальное+модельное время в пути между станциями
}

// Доли назначения при сортировке/поступлении — используются behavior-хуками конкретных типов станций.
export interface DestinationMix {
  local: number;
  truck: number;
}

export interface StationParamsCommon {
  resourceCount: number; // число параллельных «серверов» (докеры/сортировщики/место в буфере и т.п.)
  serviceTime: Distribution; // время обслуживания одного цикла
  batchIn: number; // сколько сущностей нужно накопить в очереди, чтобы начать цикл обслуживания
  queueCapacity?: number; // undefined = не ограничено; при переполнении сущность считается потерянной
}

export interface SourceParams {
  interarrival: Distribution;
  unitsPerTruck: Distribution; // сколько грузовых единиц везёт одна машина
  nonsortShare: number; // 0..1 доля машин с нонсортом (для sourceForward)
  crossdockShare: number; // 0..1 доля машин с готовым кросс-док грузом (для sourceForward); остаток — сортовой груз
}

export interface SortParams {
  nonsortDestinationMix: DestinationMix;
  sortDestinationMix: DestinationMix;
}

export interface ReturnsInspectParams {
  damagedShare: number; // 0..1 доля брака среди возвратов
}

export interface Station {
  id: string;
  type: StationType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  common: StationParamsCommon;
  source?: SourceParams;
  sort?: SortParams;
  returnsInspect?: ReturnsInspectParams;
  // Переопределяют STATION_COLORS[type]/STATION_HINTS[type] на плане и в панели параметров —
  // заполняются при создании станции из своего прототипа (см. store/prototypeStore.ts), но
  // остаются обычными редактируемыми полями конкретного экземпляра станции, без связи с
  // прототипом после создания (снапшот, не «класс со ссылкой на родителя»).
  color?: string;
  description?: string;
}

// Пользовательский шаблон «своей» станции — имя/описание/цвет/параметры по умолчанию,
// сохраняется в отдельной постоянной библиотеке (store/prototypeStore.ts), не привязан к
// конкретному сценарию. Всегда создаёт станцию с type:'custom' (простой passthrough,
// см. domain/behaviors.ts) — прототип шаблонирует ТОЛЬКО общие параметры (common), не
// специфичные блоки source/sort/returnsInspect.
export interface StationPrototype {
  id: string;
  name: string;
  description: string;
  color: string;
  common: StationParamsCommon;
}

// Заметка по batchIn (StationParamsCommon): для 'pack'/'shipTruck'/'shipCourier' это и есть
// вместимость упаковки/машины/мобильного контейнера — сколько входящих сущностей объединяются
// в 1 исходящую за один цикл обслуживания (см. domain/behaviors.ts).

export interface Scenario {
  id: string;
  name: string;
  seed: number;
  durationHours: number; // сколько модельного времени прогонять при запуске
  stations: Station[];
  edges: Edge[];
}

// ---- Сущности симуляции ----

export interface HistoryPoint {
  stationId: string;
  enterQueue: number;
  enterService?: number;
  leave?: number;
}

export interface SimEntity {
  id: string;
  kind: EntityKind;
  flow: FlowDir;
  sortType?: SortType;
  destination?: Destination;
  condition?: Condition;
  unitsPerTruck?: number;
  createdAt: number;
  history: HistoryPoint[];
}

export const STATION_LABELS: Record<StationType, string> = {
  sourceForward: 'Приезд грузовиков (прямой поток)',
  sourceReturn: 'Приезд возвратов/брака',
  gate: 'Ворота (разгрузка)',
  sort: 'Сортировка',
  storage: 'Временное хранение',
  pack: 'Упаковка',
  mobileContainer: 'Формирование мобильных контейнеров',
  palletize: 'Паллетирование',
  shipTruck: 'Отгрузка: грузовик',
  shipCourier: 'Отгрузка: курьер (маршрутный лист)',
  returnsGate: 'Приём возвратов',
  returnsInspect: 'Инспекция возврата',
  utilization: 'Утилизация/списание',
  custom: 'Своя станция',
};

export const STATION_HINTS: Record<StationType, string> = {
  sourceForward: 'Генератор машин с грузом от продавцов/склада-отправителя. Сам не занимает людей — просто создаёт грузовики по расписанию.',
  sourceReturn: 'Генератор возвратов и брака от клиентов/курьеров — отдельный поток от прямых поставок.',
  gate: 'Разгрузка машины на воротах: один грузовик превращается в несколько грузовых единиц.',
  sort: 'Вскрытие сортового груза и распределение единиц по назначению: остаться на складе (локально) или уехать грузовиком.',
  storage: 'Буфер временного хранения — «вместимость» это места на стеллажах/в ячейках, а не люди.',
  pack: 'Упаковка отдельных грузовых единиц в короба/упаковки под конкретного получателя.',
  mobileContainer: 'Несколько упаковок объединяются в один мобильный контейнер — его целиком заберёт курьер.',
  palletize: 'Несколько грузовых единиц формируются в одну паллету под погрузку в грузовик.',
  shipTruck: 'Погрузка паллет (и транзитных грузов кросс-дока) в исходящий грузовик и отправка.',
  shipCourier: 'Мобильный контейнер закрывается и привязывается к маршрутному листу курьера.',
  returnsGate: 'Приёмка машины/партии с возвратами — аналог ворот, но для обратного потока.',
  returnsInspect: 'Проверка возврата: исправные единицы едут обратно на склад, брак — в утилизацию.',
  utilization: 'Списание и утилизация повреждённого/бракованного груза.',
  custom: 'Универсальная станция без специфичного поведения — просто люди + время обслуживания + размер партии, маршрутизация настраивается связями. Для процессов, которые не описаны готовыми типами.',
};

export const STATION_COLORS: Record<StationType, string> = {
  sourceForward: '#3b82f6',
  sourceReturn: '#a855f7',
  gate: '#0ea5e9',
  sort: '#f59e0b',
  storage: '#64748b',
  pack: '#10b981',
  mobileContainer: '#22c55e',
  palletize: '#0891b2',
  shipTruck: '#2563eb',
  shipCourier: '#059669',
  returnsGate: '#c084fc',
  returnsInspect: '#e879f9',
  utilization: '#ef4444',
  custom: '#9ca3af',
};
