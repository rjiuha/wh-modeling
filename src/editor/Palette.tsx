// src/editor/Palette.tsx
// Панель добавления станций на план. Клик по типу добавляет станцию в левую верхнюю область,
// дальше её можно перетащить. Стандартные типы станций можно СКРЫВАТЬ из списка (кнопка «×»),
// но только если этот тип ещё не применён на плане (см. hideStationType); скрытые восстанавливаются
// в блоке «Скрытые». Личная библиотека прототипов сгруппирована по категориям (входная/промежуточная/
// конечная); прототип создаёт станцию вашего реального типа (domain/types.ts), а не 'custom'.
import { useState } from 'react';
import {
  PROTOTYPE_CATEGORIES,
  PROTOTYPE_CATEGORY_LABELS,
  StationTypes,
  STATION_COLORS,
  STATION_LABELS,
} from '../domain/types';
import type { StationType } from '../domain/types';
import { useScenarioStore } from '../store/scenarioStore';
import { usePrototypeStore } from '../store/prototypeStore';
import { PrototypeEditorDialog } from './PrototypeEditorDialog';

let addCounter = 0;
function nextPos(): { x: number; y: number } {
  addCounter++;
  return { x: 40 + (addCounter % 5) * 40, y: 560 + Math.floor(addCounter / 5) * 10 };
}

export function Palette() {
  const addStation = useScenarioStore((s) => s.addStation);
  const hiddenStationTypes = useScenarioStore((s) => s.hiddenStationTypes);
  const hideStationType = useScenarioStore((s) => s.hideStationType);
  const unhideStationType = useScenarioStore((s) => s.unhideStationType);
  const prototypes = usePrototypeStore((s) => s.prototypes);
  const [protoDialogOpen, setProtoDialogOpen] = useState(false);

  const hide = (type: StationType) => {
    const ok = hideStationType(type);
    if (!ok) alert(`Нельзя скрыть тип «${STATION_LABELS[type]}»: на плане уже есть станция этого типа.`);
  };

  const visibleTypes = StationTypes.filter((t) => !hiddenStationTypes.includes(t));
  const visiblePrototypes = prototypes.filter((p) => !hiddenStationTypes.includes(p.type));

  return (
    <div className="palette">
      <div className="panel-title">Добавить станцию</div>
      <div className="palette-grid">
        {visibleTypes.map((t) => (
          <button
            key={t}
            className="palette-item"
            style={{ borderColor: STATION_COLORS[t] }}
            onClick={() => {
              const { x, y } = nextPos();
              addStation(t, x, y);
            }}
          >
            <span className="palette-dot" style={{ background: STATION_COLORS[t] }} />
            {STATION_LABELS[t]}
            <span
              className="palette-hide"
              title="Скрыть тип из списка (нельзя, если он применён на плане)"
              onClick={(e) => {
                e.stopPropagation();
                hide(t);
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>

      {hiddenStationTypes.length > 0 && (
        <div className="palette-hidden">
          <div className="palette-cat-title">Скрытые типы</div>
          {hiddenStationTypes.map((t) => (
            <div key={t} className="palette-hidden-row">
              <span className="palette-hidden-dot" style={{ background: STATION_COLORS[t] }} />
              {STATION_LABELS[t]}
              <span className="palette-restore" title="Вернуть тип в список" onClick={() => unhideStationType(t)}>
                ➕
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="panel-title" style={{ marginTop: 14 }}>
        Мои прототипы
      </div>
      {PROTOTYPE_CATEGORIES.map((cat) => {
        const list = visiblePrototypes.filter((p) => p.category === cat);
        if (list.length === 0) return null;
        return (
          <div key={cat}>
            <div className="palette-cat-title">{PROTOTYPE_CATEGORY_LABELS[cat]}</div>
            <div className="palette-grid">
              {list.map((p) => (
                <button
                  key={p.id}
                  className="palette-item"
                  style={{ borderColor: p.color }}
                  onClick={() => {
                    const { x, y } = nextPos();
                    addStation(p.type, x, y, {
                      name: p.name,
                      color: p.color,
                      description: p.description,
                      common: p.common,
                      source: p.source,
                      sort: p.sort,
                      returnsInspect: p.returnsInspect,
                    });
                  }}
                >
                  <span className="palette-dot" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {visiblePrototypes.length === 0 && <p className="hint-text">Пока не создано ни одного.</p>}

      <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setProtoDialogOpen(true)}>
        + Создать/изменить прототип
      </button>

      {protoDialogOpen && <PrototypeEditorDialog onClose={() => setProtoDialogOpen(false)} />}
    </div>
  );
}
