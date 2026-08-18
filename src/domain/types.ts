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
  'gate',
  'sort',
  'storage',
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
  crossdock: 'транзит (уже готовый груз, без обработки)',
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
  travelTime?: Distribution; // визуальное+модельное время в пути между станциями (общее; фолбэк)
  // Время переноса ОТДЕЛЬНО для каждого вида предмета (не заданные — фолбэк на travelTime).
  travelTimeByKind?: Partial<Record<EntityKind, Distribution>>;
}

// Доли назначения при сортировке/поступлении — используются behavior-хуками конкретных типов станций.
export interface DestinationMix {
  local: number;
  truck: number;
}

export interface StationParamsCommon {
  resourceCount: number; // число параллельных «серверов» (докеры/сортировщики/место в буфере и т.п.)
  serviceTime: Distribution; // время обслуживания одного цикла (общее; фолбэк если вид не задан в serviceTimeByKind)
  batchIn: number; // сколько сущностей нужно накопить в очереди, чтобы начать цикл обслуживания
  queueCapacity?: number; // undefined = не ограничено; при переполнении сущность считается потерянной
  // Время цикла ОТДЕЛЬНО для каждого вида предмета (только те виды, что заданы; не заданные —
  // фолбэк на serviceTime). Цикл берёт партию сущностей, время выбирается по виду ПЕРВОЙ в партии.
  serviceTimeByKind?: Partial<Record<EntityKind, Distribution>>;
}

export interface SourceParams {
  interarrival: Distribution;
  unitsPerTruck: Distribution; // сколько грузовых единиц везёт одна машина
  returnShare: number; // 0..1 доля машин, привозящих возвраты (в составе прямого потока на входе)
  nonsortShare: number; // 0..1 доля ПРЯМОГО (не возвратного) груза с нонсортом; остаток прямого — сорт-груз
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

// Категория прототипа — определяет, какие параметры редактируются и какой встроенный тип станции
// может стоять за прототипом. Входные — источники груза (доли входа), промежуточные — обработка
// (люди + время обслуживания, в т.ч. по видам предметов), конечные — отправка/списание (люди).
export type PrototypeCategory = 'input' | 'intermediate' | 'terminal';
export const PROTOTYPE_CATEGORY_LABELS: Record<PrototypeCategory, string> = {
  input: 'Входная (источник груза)',
  intermediate: 'Промежуточная (обработка)',
  terminal: 'Конечная (отправка/списание)',
};
export const PROTOTYPE_CATEGORIES: PrototypeCategory[] = ['input', 'intermediate', 'terminal'];

// К какой категории прототипа относится каждый встроенный тип станции. Используется, чтобы в
// диалоге прототипа выбрать конкретный тип внутри категории, а при создании станции из прототипа
// родить станцию РЕАЛЬНОГО типа (движок учитывает доли/время через behaviors/engine), а не 'custom'.
export const STATION_CATEGORY: Record<StationType, PrototypeCategory> = {
  sourceForward: 'input',
  gate: 'intermediate',
  sort: 'intermediate',
  storage: 'intermediate',
  mobileContainer: 'intermediate',
  palletize: 'intermediate',
  shipTruck: 'terminal',
  shipCourier: 'terminal',
  returnsGate: 'intermediate',
  returnsInspect: 'intermediate',
  utilization: 'terminal',
  custom: 'intermediate',
};
export function stationTypesOfCategory(cat: PrototypeCategory): StationType[] {
  return StationTypes.filter((t) => STATION_CATEGORY[t] === cat);
}

// Пользовательский шаблон станции — имя/описание/цвет + параметры, сохраняется в отдельной
// постоянной библиотеке (store/prototypeStore.ts), не привязан к конкретному сценарию. В отличие
// от старой модели (всегда создавала 'custom'), прототип теперь несёт КАТЕГОРИЮ и конкретный
// встроенный тип (type), поэтому создание станции из прототипа рождает станцию РЕАЛЬНОГО типа с
// его специфичными блоками (source/sort/returnsInspect) — движок учитывает доли/время.
export interface StationPrototype {
  id: string;
  name: string;
  description: string;
  color: string;
  category: PrototypeCategory;
  type: StationType; // конкретный встроенный тип станции за прототипом
  common: StationParamsCommon;
  source?: SourceParams; // если type === 'sourceForward'
  sort?: SortParams; // если type === 'sort'
  returnsInspect?: ReturnsInspectParams; // если type === 'returnsInspect'
}

// Заметка по batchIn (StationParamsCommon): для 'shipTruck'/'shipCourier'/'mobileContainer'/
// 'palletize' это и есть вместимость машины/мобильного контейнера/паллеты — сколько входящих
// сущностей объединяются в 1 исходящую за один цикл обслуживания (см. domain/behaviors.ts).
// Отдельной станции «упаковка» нет: товар упаковывается на сортировке.

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
  sourceForward: 'Приезд грузовиков',
  gate: 'Ворота (разгрузка)',
  sort: 'Сортировка',
  storage: 'Временное хранение',
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
  sourceForward: 'Генератор машин от продавцов/склада-отправителя. Сам не занимает людей — просто создаёт грузовики по расписанию. По доле возвратов часть машин уходит на приём возвратов, остальной груз делится на сортовой/нонсорт.',
  gate: 'Разгрузка машины на воротах: один грузовик превращается в несколько грузовых единиц.',
  sort: 'Вскрытие сортового груза и распределение единиц по назначению: остаться на складе (локально) или уехать грузовиком. Здесь же товар упаковывается — отдельной станции «упаковка» нет.',
  storage: 'Буфер временного хранения — «вместимость» это места на стеллажах/в ячейках, а не люди.',
  mobileContainer: 'Несколько грузовых единиц объединяются в один мобильный контейнер — его целиком заберёт курьер.',
  palletize: 'Несколько грузовых единиц формируются в одну паллету под погрузку в грузовик.',
  shipTruck: 'Погрузка паллет в исходящий грузовик и отправка. (Готовый транзит больше не создаётся на входе.)',
  shipCourier: 'Мобильный контейнер закрывается и привязывается к маршрутному листу курьера.',
  returnsGate: 'Приёмка машины/партии с возвратами — вход обратного потока, куда уходят возвратные машины от прямого источника.',
  returnsInspect: 'Проверка возврата: исправные единицы едут обратно на склад, брак — в утилизацию.',
  utilization: 'Списание и утилизация повреждённого/бракованного груза.',
  custom: 'Универсальная станция без специфичного поведения — просто люди + время обслуживания + размер партии, маршрутизация настраивается связями. Для процессов, которые не описаны готовыми типами.',
};

export const STATION_COLORS: Record<StationType, string> = {
  sourceForward: '#3b82f6',
  gate: '#0ea5e9',
  sort: '#f59e0b',
  storage: '#64748b',
  mobileContainer: '#22c55e',
  palletize: '#0891b2',
  shipTruck: '#2563eb',
  shipCourier: '#059669',
  returnsGate: '#c084fc',
  returnsInspect: '#e879f9',
  utilization: '#ef4444',
  custom: '#9ca3af',
};
