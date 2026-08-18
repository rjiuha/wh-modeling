// src/editor/EntityKindTimeEditor.tsx
// Раскрываемый редактор «время по видам предметов»: по умолчанию свёрнут — вид не задан, движок
// берёт общее время (travelTime / serviceTime). Раскрытие включает режим per-kind: чекбокс для
// каждого вида предмета + компактный редактор распределения (без длинных подсказок, чтобы список
// из 7 видов не раздувал панель). «Пусто/снятая галка» = фолбэк на общее время.
import { useState } from 'react';
import type { Distribution, DistributionKind, EntityKind } from '../domain/types';
import { ENTITY_KIND_LABELS } from '../domain/types';

const KINDS: EntityKind[] = ['truck', 'unit', 'container', 'pallet', 'mobileContainer', 'returnUnit', 'returnTruck'];

const KIND_LABELS: Record<DistributionKind, string> = {
  const: 'Константа',
  uniform: 'Равномерное',
  exponential: 'Экспоненциальное',
  normal: 'Нормальное',
  triangular: 'Треугольное',
};

function withKind(kind: DistributionKind, prev?: Distribution): Distribution {
  switch (kind) {
    case 'const':
      return { kind, value: prev && 'value' in prev ? prev.value : 0.05 };
    case 'uniform':
      return { kind, min: prev && 'min' in prev ? prev.min : 0.02, max: prev && 'max' in prev ? prev.max : 0.1 };
    case 'exponential':
      return { kind, mean: prev && 'mean' in prev ? prev.mean : 0.05 };
    case 'normal':
      return { kind, mean: prev && 'mean' in prev ? prev.mean : 0.05, stdDev: prev && 'stdDev' in prev ? prev.stdDev : 0.02 };
    case 'triangular':
      return { kind, min: prev && 'min' in prev ? prev.min : 0.02, mode: prev && 'mode' in prev ? prev.mode : 0.05, max: prev && 'max' in prev ? prev.max : 0.1 };
  }
}

function Num({ tag, value, onChange }: { tag: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="labeled-num">
      <span className="labeled-num-tag">{tag}</span>
      <input type="number" step="0.01" className="num-input" value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  );
}

function CompactDist({ value, onChange }: { value: Distribution; onChange: (d: Distribution) => void }) {
  return (
    <span className="dist-row">
      <select className="dist-kind-select" value={value.kind} onChange={(e) => onChange(withKind(e.target.value as DistributionKind, value))}>
        {Object.entries(KIND_LABELS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      {value.kind === 'const' && <Num tag="значение" value={value.value} onChange={(v) => onChange({ ...value, value: v })} />}
      {value.kind === 'uniform' && (
        <>
          <Num tag="мин" value={value.min} onChange={(v) => onChange({ ...value, min: v })} />
          <Num tag="макс" value={value.max} onChange={(v) => onChange({ ...value, max: v })} />
        </>
      )}
      {value.kind === 'exponential' && <Num tag="среднее" value={value.mean} onChange={(v) => onChange({ ...value, mean: v })} />}
      {value.kind === 'normal' && (
        <>
          <Num tag="среднее" value={value.mean} onChange={(v) => onChange({ ...value, mean: v })} />
          <Num tag="σ" value={value.stdDev} onChange={(v) => onChange({ ...value, stdDev: v })} />
        </>
      )}
      {value.kind === 'triangular' && (
        <>
          <Num tag="мин" value={value.min} onChange={(v) => onChange({ ...value, min: v })} />
          <Num tag="типично" value={value.mode} onChange={(v) => onChange({ ...value, mode: v })} />
          <Num tag="макс" value={value.max} onChange={(v) => onChange({ ...value, max: v })} />
        </>
      )}
    </span>
  );
}

export function EntityKindTimeEditor({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  value?: Partial<Record<EntityKind, Distribution>>;
  onChange: (v: Partial<Record<EntityKind, Distribution>> | undefined) => void;
}) {
  const [open, setOpen] = useState(value !== undefined && Object.keys(value ?? {}).length > 0);
  const dist = value ?? {};

  const toggleEnabled = (enabled: boolean) => {
    if (enabled) {
      setOpen(true);
      // Пустой объект = включен режим, но пока всё «как общее»; движок разницы не увидит, пока не задан вид.
      if (value) onChange(value);
      else onChange({});
    } else {
      setOpen(false);
      onChange(undefined);
    }
  };

  const setKind = (kind: EntityKind, d: Distribution | undefined) => {
    const next: Partial<Record<EntityKind, Distribution>> = { ...dist };
    if (d) next[kind] = d;
    else delete next[kind];
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div className="field-group">
      <div className="field-group inline" style={{ marginBottom: 4 }}>
        <label className="field-label">{label} {unit ? <span className="field-unit">({unit})</span> : null}</label>
        <label className="check-inline">
          <input type="checkbox" checked={open} onChange={(e) => toggleEnabled(e.target.checked)} />
          по видам
        </label>
      </div>
      {open && (
        <div className="ekind-list">
          {KINDS.map((k) => (
            <div key={k} className="ekind-row">
              <label className="check-inline ekind-check">
                <input
                  type="checkbox"
                  checked={dist[k] !== undefined}
                  onChange={(e) => setKind(k, e.target.checked ? withKind('triangular') : undefined)}
                />
                <span className="ekind-name">{ENTITY_KIND_LABELS[k]}</span>
              </label>
              {dist[k] ? <CompactDist value={dist[k]!} onChange={(d) => setKind(k, d)} /> : <span className="hint-text">(общее время)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
