// src/editor/Palette.tsx
// Панель добавления станций на план. Клик по типу добавляет станцию в левый верхний угол
// свободной области — дальше её можно перетащить куда нужно. Плюс личная библиотека прототипов
// «своих» станций (см. store/prototypeStore.ts) — они всегда создают type:'custom', но с
// именем/цветом/описанием/параметрами из прототипа.
import { useState } from 'react';
import { StationTypes, STATION_LABELS, STATION_COLORS } from '../domain/types';
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
  const prototypes = usePrototypeStore((s) => s.prototypes);
  const [protoDialogOpen, setProtoDialogOpen] = useState(false);

  return (
    <div className="palette">
      <div className="panel-title">Добавить станцию</div>
      <div className="palette-grid">
        {StationTypes.map((t) => (
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
          </button>
        ))}
      </div>

      <div className="panel-title" style={{ marginTop: 14 }}>
        Мои прототипы
      </div>
      <div className="palette-grid">
        {prototypes.map((p) => (
          <button
            key={p.id}
            className="palette-item"
            style={{ borderColor: p.color }}
            onClick={() => {
              const { x, y } = nextPos();
              addStation('custom', x, y, { name: p.name, color: p.color, description: p.description, common: p.common });
            }}
          >
            <span className="palette-dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
        {prototypes.length === 0 && <p className="hint-text">Пока не создано ни одного.</p>}
      </div>
      <button className="btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={() => setProtoDialogOpen(true)}>
        + Создать/изменить прототип
      </button>

      {protoDialogOpen && <PrototypeEditorDialog onClose={() => setProtoDialogOpen(false)} />}
    </div>
  );
}
