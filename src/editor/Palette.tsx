// src/editor/Palette.tsx
// Панель добавления станций на план. Клик по типу добавляет станцию в левый верхний угол
// свободной области — дальше её можно перетащить куда нужно.
import { StationTypes, STATION_LABELS, STATION_COLORS } from '../domain/types';
import { useScenarioStore } from '../store/scenarioStore';

let addCounter = 0;

export function Palette() {
  const addStation = useScenarioStore((s) => s.addStation);

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
              addCounter++;
              const x = 40 + (addCounter % 5) * 40;
              const y = 560 + Math.floor(addCounter / 5) * 10;
              addStation(t, x, y);
            }}
          >
            <span className="palette-dot" style={{ background: STATION_COLORS[t] }} />
            {STATION_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
