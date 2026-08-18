// src/editor/PrototypeEditorDialog.tsx
// Управление личной библиотекой прототипов станций: список слева (создать/выбрать/удалить),
// форма редактирования выбранного справа. Прототип теперь несёт КАТЕГОРИЮ (входная/промежуточная/
// конечная) и конкретный встроенный тип станции — форма подстраивается под тип: для источника
// груза — доли входа (возвраты/нонсорт) и интервал, для обработки — люди + время обслуживания
// (в т.ч. по видам предметов), для отправки/списания — люди. Создание станции из прототипа даёт
// станцию РЕАЛЬНОГО типа, чьи настройки движок учитывает (см. store/prototypeStore.ts).
import { useState } from 'react';
import {
  PROTOTYPE_CATEGORIES,
  PROTOTYPE_CATEGORY_LABELS,
  STATION_LABELS,
  stationTypesOfCategory,
} from '../domain/types';
import type { PrototypeCategory, ReturnsInspectParams, SortParams, SourceParams, StationPrototype, StationType } from '../domain/types';
import { usePrototypeStore, newPrototypeDraft } from '../store/prototypeStore';
import { defaultStationParams } from '../store/scenarioStore';
import { DistributionEditor } from './DistributionEditor';
import { EntityKindTimeEditor } from './EntityKindTimeEditor';

type Draft = Omit<StationPrototype, 'id'>;

function blocksForType(type: StationType): Pick<StationPrototype, 'source' | 'sort' | 'returnsInspect'> {
  const def = defaultStationParams(type);
  return { source: def.source, sort: def.sort, returnsInspect: def.returnsInspect };
}

// Числовой слайдер 0..1 с процентами (доли входа / назначения).
function ShareRange({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field-group inline">
      <label className="field-label">{label}</label>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="range-value">{Math.round(value * 100)}%</span>
    </div>
  );
}

function SourceEditors({ source, onChange }: { source: SourceParams; onChange: (s: SourceParams) => void }) {
  return (
    <>
      <DistributionEditor
        label="Интервал между прибытиями"
        unit="ч"
        value={source.interarrival}
        onChange={(d) => onChange({ ...source, interarrival: d })}
      />
      <DistributionEditor
        label="Единиц груза на машину"
        value={source.unitsPerTruck}
        onChange={(d) => onChange({ ...source, unitsPerTruck: d })}
      />
      <ShareRange label="Доля возвратов" value={source.returnShare} onChange={(v) => onChange({ ...source, returnShare: v })} />
      <ShareRange
        label="Доля нонсорта (среди прямого груза)"
        value={source.nonsortShare}
        onChange={(v) => onChange({ ...source, nonsortShare: v })}
      />
    </>
  );
}

function SortEditors({ sort, onChange }: { sort: SortParams; onChange: (s: SortParams) => void }) {
  return (
    <>
      <ShareRange
        label="Нонсорт → локально"
        value={sort.nonsortDestinationMix.local}
        onChange={(v) => onChange({ ...sort, nonsortDestinationMix: { local: v, truck: 1 - v } })}
      />
      <ShareRange
        label="Сортовой → локально"
        value={sort.sortDestinationMix.local}
        onChange={(v) => onChange({ ...sort, sortDestinationMix: { local: v, truck: 1 - v } })}
      />
    </>
  );
}

function ReturnsEditors({ params, onChange }: { params: ReturnsInspectParams; onChange: (p: ReturnsInspectParams) => void }) {
  return <ShareRange label="Доля брака" value={params.damagedShare} onChange={(v) => onChange({ damagedShare: v })} />;
}

export function PrototypeEditorDialog({ onClose }: { onClose: () => void }) {
  const prototypes = usePrototypeStore((s) => s.prototypes);
  const addPrototype = usePrototypeStore((s) => s.addPrototype);
  const updatePrototype = usePrototypeStore((s) => s.updatePrototype);
  const removePrototype = usePrototypeStore((s) => s.removePrototype);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(newPrototypeDraft());

  const isSource = draft.type === 'sourceForward';
  const isSort = draft.type === 'sort';
  const isReturnsInspect = draft.type === 'returnsInspect';

  const startNew = () => {
    setEditingId(null);
    setDraft(newPrototypeDraft());
  };
  const startEdit = (p: StationPrototype) => {
    setEditingId(p.id);
    const { id: _id, ...rest } = p;
    setDraft(rest);
  };
  const changeCategory = (cat: PrototypeCategory) => {
    const first = stationTypesOfCategory(cat)[0];
    setDraft({ ...draft, category: cat, type: first, ...blocksForType(first) });
  };
  const changeType = (type: StationType) => {
    setDraft({ ...draft, type, ...blocksForType(type) });
  };
  const save = () => {
    if (!draft.name.trim()) return;
    if (editingId) updatePrototype(editingId, draft);
    else {
      const id = addPrototype(draft);
      setEditingId(id);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel proto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">Мои прототипы станций</div>
        <p className="hint-text">
          Прототип — шаблон станции с именем/описанием/цветом и параметрами. Категория задаёт, КАКУЮ станцию
          он создаёт: входную (источник груза с долями), промежуточную (обработка: люди + время, в т.ч. по
          видам предметов) или конечную (отгрузка/списание — люди). Станция из прототипа — реального типа,
          движок учитывает заданные доли и времена.
        </p>

        <div className="proto-layout">
          <div className="proto-list">
            <button className="btn-secondary proto-new-btn" onClick={startNew}>
              + Новый прототип
            </button>
            {prototypes.length === 0 && <p className="hint-text">Пока пусто.</p>}
            {prototypes.map((p) => (
              <div key={p.id} className={`proto-list-item ${editingId === p.id ? 'active' : ''}`} onClick={() => startEdit(p)}>
                <span className="palette-dot" style={{ background: p.color }} />
                <span className="proto-list-name">{p.name}</span>
                <button
                  className="compare-remove"
                  title="Удалить прототип"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePrototype(p.id);
                    if (editingId === p.id) startNew();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="proto-form">
            <div className="field-group inline">
              <label className="field-label">Категория</label>
              <select value={draft.category} onChange={(e) => changeCategory(e.target.value as PrototypeCategory)}>
                {PROTOTYPE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PROTOTYPE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group inline">
              <label className="field-label">Тип станции</label>
              <select value={draft.type} onChange={(e) => changeType(e.target.value as StationType)}>
                {stationTypesOfCategory(draft.category).map((t) => (
                  <option key={t} value={t}>
                    {STATION_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label">Название</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">Описание (подсказка в панели параметров)</label>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} />
            </div>
            <div className="field-group inline">
              <label className="field-label">Цвет</label>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
            </div>

            {/* Входная: источник груза — доли и интервал, люд/время не применимы (константа 0). */}
            {isSource && draft.source && <SourceEditors source={draft.source} onChange={(source) => setDraft({ ...draft, source })} />}

            {!isSource && (
              <>
                <div className="field-group inline">
                  <label className="field-label">Людей (одновременно работают)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.common.resourceCount}
                    onChange={(e) => setDraft({ ...draft, common: { ...draft.common, resourceCount: parseInt(e.target.value) || 1 } })}
                  />
                </div>
                <DistributionEditor
                  label="Время обслуживания"
                  unit="ч"
                  value={draft.common.serviceTime}
                  onChange={(d) => setDraft({ ...draft, common: { ...draft.common, serviceTime: d } })}
                />
                <EntityKindTimeEditor
                  label="Время обработки по видам"
                  unit="ч"
                  value={draft.common.serviceTimeByKind}
                  onChange={(v) => setDraft({ ...draft, common: { ...draft.common, serviceTimeByKind: v } })}
                />
                <div className="field-group inline">
                  <label className="field-label">Размер партии (batch)</label>
                  <input
                    type="number"
                    min={1}
                    value={draft.common.batchIn}
                    onChange={(e) => setDraft({ ...draft, common: { ...draft.common, batchIn: parseInt(e.target.value) || 1 } })}
                  />
                </div>
                <div className="field-group inline">
                  <label className="field-label">Лимит очереди</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="без лимита"
                    value={draft.common.queueCapacity ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, common: { ...draft.common, queueCapacity: e.target.value ? parseInt(e.target.value) : undefined } })
                    }
                  />
                </div>
              </>
            )}

            {isSort && draft.sort && <SortEditors sort={draft.sort} onChange={(sort) => setDraft({ ...draft, sort })} />}
            {isReturnsInspect && draft.returnsInspect && (
              <ReturnsEditors params={draft.returnsInspect} onChange={(returnsInspect) => setDraft({ ...draft, returnsInspect })} />
            )}

            <div className="prop-actions">
              <button className="btn-primary" disabled={!draft.name.trim()} onClick={save}>
                {editingId ? 'Сохранить прототип' : 'Создать прототип'}
              </button>
            </div>
          </div>
        </div>

        <div className="prop-actions" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
