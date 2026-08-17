// src/editor/DistributionEditor.tsx
// Компактный редактор распределения времени/интервала — выбор вида + нужные числовые поля,
// подписанные явно (не только placeholder'ом), плюс живое объяснение выбранного вида под формой —
// это то место, которое чаще всего непонятно с первого взгляда (особенно «треугольное»).
import type { Distribution, DistributionKind } from '../domain/types';

const KIND_LABELS: Record<DistributionKind, string> = {
  const: 'Константа',
  uniform: 'Равномерное',
  exponential: 'Экспоненциальное',
  normal: 'Нормальное',
  triangular: 'Треугольное',
};

const KIND_HELP: Record<DistributionKind, string> = {
  const:
    'Всегда одно и то же значение, без случайности. Удобно для быстрой обкатки логики, но реальный процесс так не работает — на финальный сценарий лучше поставить одно из распределений ниже.',
  uniform:
    '«Любое значение в диапазоне мин…макс с равной вероятностью». Используйте, когда знаете только границы (например, «разгрузка занимает от 10 до 30 минут»), но не знаете, какое значение внутри диапазона типичнее.',
  exponential:
    'Классика для интервалов между случайными независимыми событиями — например, между приездами машин. Задаётся только средним; большинство интервалов будут короче среднего, но изредка попадаются заметно длиннее.',
  normal:
    '«Колокол» вокруг среднего: большинство значений близки к среднему, отклонения в обе стороны одинаково вероятны и тем реже, чем они больше. Задаётся средним и σ (чем больше σ — тем сильнее разброс). Может дать отрицательное значение при большом σ — движок обрежет его до 0.',
  triangular:
    'Треугольное: вы задаёте три числа — минимум, максимум и «моду» (самое вероятное, типичное значение между ними). Это способ смоделировать «обычно занимает около X, но иногда быстрее/медленнее», когда нет статистики, а есть только экспертная оценка «в среднем — от — до».',
};

function withKind(kind: DistributionKind, prev: Distribution): Distribution {
  switch (kind) {
    case 'const':
      return { kind, value: 'value' in prev ? prev.value : 1 };
    case 'uniform':
      return { kind, min: 'min' in prev ? prev.min : 0.1, max: 'max' in prev ? prev.max : 0.5 };
    case 'exponential':
      return { kind, mean: 'mean' in prev ? prev.mean : 0.5 };
    case 'normal':
      return { kind, mean: 'mean' in prev ? prev.mean : 0.3, stdDev: 'stdDev' in prev ? prev.stdDev : 0.1 };
    case 'triangular':
      return {
        kind,
        min: 'min' in prev ? prev.min : 0.1,
        mode: 'mode' in prev ? prev.mode : 0.2,
        max: 'max' in prev ? prev.max : 0.4,
      };
  }
}

function LabeledNum({ tag, value, onChange }: { tag: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="labeled-num">
      <span className="labeled-num-tag">{tag}</span>
      <input
        type="number"
        step="0.01"
        className="num-input"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

export function DistributionEditor({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  value: Distribution;
  onChange: (d: Distribution) => void;
}) {
  return (
    <div className="field-group">
      <label className="field-label">
        {label} {unit ? <span className="field-unit">({unit})</span> : null}
      </label>
      <div className="dist-row">
        <select
          className="dist-kind-select"
          value={value.kind}
          onChange={(e) => onChange(withKind(e.target.value as DistributionKind, value))}
        >
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        {value.kind === 'const' && <LabeledNum tag="значение" value={value.value} onChange={(v) => onChange({ ...value, value: v })} />}
        {value.kind === 'uniform' && (
          <>
            <LabeledNum tag="мин" value={value.min} onChange={(v) => onChange({ ...value, min: v })} />
            <LabeledNum tag="макс" value={value.max} onChange={(v) => onChange({ ...value, max: v })} />
          </>
        )}
        {value.kind === 'exponential' && (
          <LabeledNum tag="среднее" value={value.mean} onChange={(v) => onChange({ ...value, mean: v })} />
        )}
        {value.kind === 'normal' && (
          <>
            <LabeledNum tag="среднее" value={value.mean} onChange={(v) => onChange({ ...value, mean: v })} />
            <LabeledNum tag="σ (разброс)" value={value.stdDev} onChange={(v) => onChange({ ...value, stdDev: v })} />
          </>
        )}
        {value.kind === 'triangular' && (
          <>
            <LabeledNum tag="мин" value={value.min} onChange={(v) => onChange({ ...value, min: v })} />
            <LabeledNum tag="мода (типично)" value={value.mode} onChange={(v) => onChange({ ...value, mode: v })} />
            <LabeledNum tag="макс" value={value.max} onChange={(v) => onChange({ ...value, max: v })} />
          </>
        )}
      </div>
      <p className="dist-help">{KIND_HELP[value.kind]}</p>
    </div>
  );
}
