// src/editor/PropertyPanel.tsx
// Панель параметров выбранного элемента: станция (люди, время обслуживания,
// специфичные для типа настройки) или ребро (условие маршрутизации, вес, время в пути).
import type { Condition, Destination, Edge, EdgeWhen, EntityKind, FlowDir, SortType, Station } from '../domain/types';
import {
  CONDITION_LABELS,
  DESTINATION_LABELS,
  ENTITY_KIND_LABELS,
  FLOW_LABELS,
  SORT_TYPE_LABELS,
  STATION_HINTS,
  STATION_LABELS,
} from '../domain/types';
import { useScenarioStore } from '../store/scenarioStore';
import { DistributionEditor } from './DistributionEditor';
import { EntityKindTimeEditor } from './EntityKindTimeEditor';
import { fullEdgeWhenDescription } from './WarehouseCanvas';

function HelpTip({ text }: { text: string }) {
  return (
    <span className="help-tip" title={text}>
      ?
    </span>
  );
}

const BATCHING_TYPES = ['mobileContainer', 'palletize', 'shipCourier', 'shipTruck', 'custom'];

function OptionalSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="field-group inline">
      <label className="field-label">{label}</label>
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}>
        <option value="">любое</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </div>
  );
}

function StationProps({ station, onStartEdgeDraft }: { station: Station; onStartEdgeDraft: () => void }) {
  const updateStation = useScenarioStore((s) => s.updateStation);
  const removeStation = useScenarioStore((s) => s.removeStation);
  const setSelected = useScenarioStore((s) => s.setSelected);

  const isSource = station.type === 'sourceForward';
  const isStorage = station.type === 'storage';

  return (
    <div className="prop-panel">
      <div className="panel-title">{STATION_LABELS[station.type]}</div>
      <p className="hint-text">{station.description || STATION_HINTS[station.type]}</p>
      <div className="field-group">
        <label className="field-label">Название</label>
        <input value={station.name} onChange={(e) => updateStation(station.id, { name: e.target.value })} />
      </div>

      {station.type === 'custom' && (
        <>
          <div className="field-group">
            <label className="field-label">Описание (своя подсказка вместо стандартной)</label>
            <textarea
              rows={2}
              value={station.description ?? ''}
              onChange={(e) => updateStation(station.id, { description: e.target.value })}
            />
          </div>
          <div className="field-group inline">
            <label className="field-label">Цвет</label>
            <input
              type="color"
              value={station.color ?? '#9ca3af'}
              onChange={(e) => updateStation(station.id, { color: e.target.value })}
            />
          </div>
        </>
      )}

      {!isSource && !isStorage && (
        <div className="field-group inline">
          <label className="field-label">
            Людей (одновременно работают)
            <HelpTip text="Сколько сотрудников/постов на этой станции работают параллельно. Каждый берёт в работу одну партию за раз — больше людей значит меньше очередь, но дороже в реальности." />
          </label>
          <input
            type="number"
            min={1}
            value={station.common.resourceCount}
            onChange={(e) =>
              updateStation(station.id, { common: { ...station.common, resourceCount: parseInt(e.target.value) || 1 } })
            }
          />
        </div>
      )}

      {!isSource && (
        <DistributionEditor
          label="Время обслуживания"
          unit="ч"
          value={station.common.serviceTime}
          onChange={(d) => updateStation(station.id, { common: { ...station.common, serviceTime: d } })}
        />
      )}

      {!isSource && (
        <EntityKindTimeEditor
          label="Время обработки по видам"
          unit="ч"
          value={station.common.serviceTimeByKind}
          onChange={(v) => updateStation(station.id, { common: { ...station.common, serviceTimeByKind: v } })}
        />
      )}

      {BATCHING_TYPES.includes(station.type) && (
        <div className="field-group inline">
          <label className="field-label">
            Размер партии (batch)
            <HelpTip text="Сколько входящих единиц нужно накопить в очереди, чтобы запустить один цикл обработки (например, сколько коробов помещается в 1 мобильный контейнер или сколько паллет — в 1 грузовик)." />
          </label>
          <input
            type="number"
            min={1}
            value={station.common.batchIn}
            onChange={(e) =>
              updateStation(station.id, { common: { ...station.common, batchIn: parseInt(e.target.value) || 1 } })
            }
          />
        </div>
      )}

      {!isSource && !isStorage && (
        <div className="field-group inline">
          <label className="field-label">
            Лимит очереди
            <HelpTip text="Максимум единиц, которые могут одновременно ждать перед станцией. Если очередь заполнена, новые прибывающие единицы считаются потерянными (см. столбец «Потери» в статистике). Пусто — без ограничения." />
          </label>
          <input
            type="number"
            min={0}
            placeholder="без лимита"
            value={station.common.queueCapacity ?? ''}
            onChange={(e) =>
              updateStation(station.id, {
                common: { ...station.common, queueCapacity: e.target.value ? parseInt(e.target.value) : undefined },
              })
            }
          />
        </div>
      )}

      {isStorage && (
        <div className="field-group inline">
          <label className="field-label">
            Вместимость (мест хранения)
            <HelpTip text="Это места на стеллажах/в ячейках, а не люди — сколько грузовых единиц может одновременно лежать на временном хранении." />
          </label>
          <input
            type="number"
            min={1}
            value={station.common.resourceCount}
            onChange={(e) =>
              updateStation(station.id, { common: { ...station.common, resourceCount: parseInt(e.target.value) || 1 } })
            }
          />
        </div>
      )}

      {isSource && station.source && (
        <>
          <DistributionEditor
            label="Интервал между прибытиями"
            unit="ч"
            value={station.source.interarrival}
            onChange={(d) => updateStation(station.id, { source: { ...station.source!, interarrival: d } })}
          />
          <DistributionEditor
            label="Единиц груза на машину"
            value={station.source.unitsPerTruck}
            onChange={(d) => updateStation(station.id, { source: { ...station.source!, unitsPerTruck: d } })}
          />
          {station.type === 'sourceForward' && (
            <>
              <div className="field-group inline">
                <label className="field-label">
                  Доля возвратов
                  <HelpTip text="Какая доля приезжающих машин везёт возвраты/брак от клиентов. Такие машины уходят на приём возвратов, а не на ворота разгрузки." />
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={station.source.returnShare}
                  onChange={(e) =>
                    updateStation(station.id, { source: { ...station.source!, returnShare: parseFloat(e.target.value) } })
                  }
                />
                <span className="range-value">{Math.round(station.source.returnShare * 100)}%</span>
              </div>
              <div className="field-group inline">
                <label className="field-label">
                  Доля нонсорта (среди прямого груза)
                  <HelpTip text="Среди прямого (не возвратного) груза — какая доля приходит россыпью (нонсорт), а какая сортовым грузом, который нужно вскрывать и пересортировывать." />
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={station.source.nonsortShare}
                  onChange={(e) =>
                    updateStation(station.id, { source: { ...station.source!, nonsortShare: parseFloat(e.target.value) } })
                  }
                />
                <span className="range-value">{Math.round(station.source.nonsortShare * 100)}%</span>
              </div>
              <p className="hint-text">
                Остаток прямого груза ({Math.max(0, Math.round((1 - station.source.nonsortShare) * 100))}%) —
                сорт-груз, едет через сортировку, где и упаковывается.
              </p>
            </>
          )}
        </>
      )}

      {station.type === 'sort' && station.sort && (
        <>
          <div className="field-group inline">
            <label className="field-label">
              Доля нонсорта, остающаяся локально
              <HelpTip text="Остальное (100% минус это значение) едет грузовиком — на паллетирование и дальше на отгрузку, а не в локальное хранение." />
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={station.sort.nonsortDestinationMix.local}
              onChange={(e) =>
                updateStation(station.id, {
                  sort: {
                    ...station.sort!,
                    nonsortDestinationMix: { local: parseFloat(e.target.value), truck: 1 - parseFloat(e.target.value) },
                  },
                })
              }
            />
            <span className="range-value">{Math.round(station.sort.nonsortDestinationMix.local * 100)}%</span>
          </div>
          <div className="field-group inline">
            <label className="field-label">Доля сортового груза, остающаяся локально</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={station.sort.sortDestinationMix.local}
              onChange={(e) =>
                updateStation(station.id, {
                  sort: {
                    ...station.sort!,
                    sortDestinationMix: { local: parseFloat(e.target.value), truck: 1 - parseFloat(e.target.value) },
                  },
                })
              }
            />
            <span className="range-value">{Math.round(station.sort.sortDestinationMix.local * 100)}%</span>
          </div>
        </>
      )}

      {station.type === 'returnsInspect' && station.returnsInspect && (
        <div className="field-group inline">
          <label className="field-label">Доля брака</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={station.returnsInspect.damagedShare}
            onChange={(e) => updateStation(station.id, { returnsInspect: { damagedShare: parseFloat(e.target.value) } })}
          />
          <span className="range-value">{Math.round(station.returnsInspect.damagedShare * 100)}%</span>
        </div>
      )}

      <div className="prop-actions">
        <button className="btn-secondary" onClick={onStartEdgeDraft}>
          Связать со станцией →
        </button>
        <button
          className="btn-danger"
          onClick={() => {
            removeStation(station.id);
            setSelected(null);
          }}
        >
          Удалить станцию
        </button>
      </div>
    </div>
  );
}

const FLOWS: FlowDir[] = ['fwd', 'ret'];
const SORT_TYPES: SortType[] = ['sort', 'nonsort', 'crossdock'];
const DESTINATIONS: Destination[] = ['local', 'truck'];
const CONDITIONS: Condition[] = ['good', 'damaged'];
const KINDS: EntityKind[] = ['truck', 'unit', 'container', 'pallet', 'mobileContainer', 'returnUnit', 'returnTruck'];

function EdgeProps({ edge, fromName, toName }: { edge: Edge; fromName: string; toName: string }) {
  const updateEdge = useScenarioStore((s) => s.updateEdge);
  const removeEdge = useScenarioStore((s) => s.removeEdge);
  const setSelected = useScenarioStore((s) => s.setSelected);
  const when = edge.when ?? {};

  const setWhen = (patch: Partial<EdgeWhen>) => {
    const next: EdgeWhen = { ...when, ...patch };
    (Object.keys(next) as (keyof EdgeWhen)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    updateEdge(edge.id, { when: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="prop-panel">
      <div className="panel-title">
        Связь: {fromName} → {toName}
      </div>
      <p className="hint-text">{fullEdgeWhenDescription(edge)}</p>
      <div className="field-group inline">
        <label className="field-label">
          Вес (доля среди подходящих)
          <HelpTip text="Если из станции выходит несколько рёбер, подходящих одной и той же сущности (например, два ребра без условия), они делят поток пропорционально весу. Если условия у рёбер разные и не пересекаются — вес не важен." />
        </label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={edge.weight}
          onChange={(e) => updateEdge(edge.id, { weight: parseFloat(e.target.value) || 0 })}
        />
      </div>
      <DistributionEditor
        label="Время в пути"
        unit="ч"
        value={edge.travelTime ?? { kind: 'const', value: 0.02 }}
        onChange={(d) => updateEdge(edge.id, { travelTime: d })}
      />
      <EntityKindTimeEditor
        label="Время переноса по видам"
        unit="ч"
        value={edge.travelTimeByKind}
        onChange={(v) => updateEdge(edge.id, { travelTimeByKind: v })}
      />
      <div className="panel-subtitle">
        Условие маршрутизации
        <HelpTip text="Сущность пойдёт по этой связи, только если совпадёт со ВСЕМИ заданными ниже полями (значение «любое» — поле не проверяется). Так вы, например, разделяете поток на местный/транзитный или исправный/бракованный." />
      </div>
      <OptionalSelect label="Поток" value={when.flow} options={FLOWS} labels={FLOW_LABELS} onChange={(v) => setWhen({ flow: v })} />
      <OptionalSelect label="Тип груза" value={when.sortType} options={SORT_TYPES} labels={SORT_TYPE_LABELS} onChange={(v) => setWhen({ sortType: v })} />
      <OptionalSelect label="Назначение" value={when.destination} options={DESTINATIONS} labels={DESTINATION_LABELS} onChange={(v) => setWhen({ destination: v })} />
      <OptionalSelect label="Состояние" value={when.condition} options={CONDITIONS} labels={CONDITION_LABELS} onChange={(v) => setWhen({ condition: v })} />
      <OptionalSelect label="Вид сущности" value={when.kind} options={KINDS} labels={ENTITY_KIND_LABELS} onChange={(v) => setWhen({ kind: v })} />
      <div className="prop-actions">
        <button
          className="btn-danger"
          onClick={() => {
            removeEdge(edge.id);
            setSelected(null);
          }}
        >
          Удалить связь
        </button>
      </div>
    </div>
  );
}

export function PropertyPanel({
  station,
  edge,
  fromName,
  toName,
  onStartEdgeDraft,
}: {
  station?: Station;
  edge?: Edge;
  fromName?: string;
  toName?: string;
  onStartEdgeDraft: () => void;
}) {
  if (station) return <StationProps station={station} onStartEdgeDraft={onStartEdgeDraft} />;
  if (edge) return <EdgeProps edge={edge} fromName={fromName ?? edge.from} toName={toName ?? edge.to} />;
  return (
    <div className="prop-panel">
      <div className="panel-title">Ничего не выбрано</div>
      <p className="hint-text">Кликните по станции или связи на плане, чтобы отредактировать параметры.</p>
    </div>
  );
}
