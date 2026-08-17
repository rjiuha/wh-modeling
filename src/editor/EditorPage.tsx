// src/editor/EditorPage.tsx
// Страница конфигуратора: палитра станций слева, 2D-план по центру (drag&drop, рисование
// связей), панель параметров справа.
import { useEffect, useState } from 'react';
import { useScenarioStore } from '../store/scenarioStore';
import { WarehouseCanvas } from './WarehouseCanvas';
import { Palette } from './Palette';
import { PropertyPanel } from './PropertyPanel';
import { HelpPanel } from './HelpPanel';

export function EditorPage() {
  const scenario = useScenarioStore((s) => s.scenario);
  const selectedId = useScenarioStore((s) => s.selectedId);
  const setSelected = useScenarioStore((s) => s.setSelected);
  const moveStation = useScenarioStore((s) => s.moveStation);
  const addEdge = useScenarioStore((s) => s.addEdge);
  const updateScenarioMeta = useScenarioStore((s) => s.updateScenarioMeta);
  const [edgeDraftFrom, setEdgeDraftFrom] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEdgeDraftFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedStation = scenario.stations.find((s) => s.id === selectedId);
  const selectedEdge = scenario.edges.find((e) => e.id === selectedId);
  const fromName = selectedEdge ? scenario.stations.find((s) => s.id === selectedEdge.from)?.name : undefined;
  const toName = selectedEdge ? scenario.stations.find((s) => s.id === selectedEdge.to)?.name : undefined;

  return (
    <div className="editor-layout">
      <div className="editor-sidebar">
        <HelpPanel />
        <Palette />
        <div className="panel-title" style={{ marginTop: 16 }}>
          Параметры сценария
        </div>
        <div className="field-group">
          <label className="field-label">Название сценария</label>
          <input value={scenario.name} onChange={(e) => updateScenarioMeta({ name: e.target.value })} />
        </div>
        <div className="field-group inline">
          <label className="field-label">Длительность (ч)</label>
          <input
            type="number"
            min={1}
            value={scenario.durationHours}
            onChange={(e) => updateScenarioMeta({ durationHours: parseFloat(e.target.value) || 1 })}
          />
        </div>
        <div className="field-group inline">
          <label className="field-label">Seed</label>
          <input
            type="number"
            value={scenario.seed}
            onChange={(e) => updateScenarioMeta({ seed: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="editor-canvas-wrap">
        {edgeDraftFrom && (
          <div className="hint-banner">Выберите станцию назначения для связи (Esc — отмена)</div>
        )}
        <WarehouseCanvas
          scenario={scenario}
          selectedId={selectedId}
          onSelectStation={(id) => setSelected(id)}
          onSelectEdge={(id) => setSelected(id)}
          onMoveStation={moveStation}
          onCanvasClick={() => {
            setSelected(null);
            setEdgeDraftFrom(null);
          }}
          edgeDraftFrom={edgeDraftFrom}
          onStationClickForEdge={(id) => {
            if (edgeDraftFrom && edgeDraftFrom !== id) {
              const newId = addEdge(edgeDraftFrom, id);
              setSelected(newId);
            }
            setEdgeDraftFrom(null);
          }}
          onCreateEdge={(from, to) => {
            const newId = addEdge(from, to);
            setSelected(newId);
          }}
        />
      </div>

      <div className="editor-props">
        <PropertyPanel
          station={selectedStation}
          edge={selectedEdge}
          fromName={fromName}
          toName={toName}
          onStartEdgeDraft={() => selectedStation && setEdgeDraftFrom(selectedStation.id)}
        />
      </div>
    </div>
  );
}
