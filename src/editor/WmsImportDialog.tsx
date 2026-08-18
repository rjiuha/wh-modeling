// src/editor/WmsImportDialog.tsx
// Диалог генерации сценария из реальной выгрузки WMS: «Схема склада.json» (обязательно) агрегируется
// по тегам ячеек в станции, «Схема рекомендаций.json» (опционально) даёт три статистики (доля брака/
// кросс-дока/нонсорта) — подробности и обоснование см. domain/wmsImport.ts.
import { useState } from 'react';
import { useScenarioStore } from '../store/scenarioStore';
import { useSimStore } from '../store/simStore';
import { parseLeadingJson, analyzeRecommendations, buildScenarioFromWarehouseSchema, type RecShares } from '../domain/wmsImport';

export function WmsImportDialog({ onClose }: { onClose: () => void }) {
  const replaceScenario = useScenarioStore((s) => s.replaceScenario);
  const clearSim = useSimStore((s) => s.clear);

  const [warehouseFile, setWarehouseFile] = useState<File | null>(null);
  const [recFile, setRecFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);

  const generate = async () => {
    if (!warehouseFile) return;
    setBusy(true);
    setError(null);
    try {
      const whJson = parseLeadingJson(await warehouseFile.text());
      let recShares: RecShares | undefined;
      const notes: string[] = [];
      if (recFile) {
        const recJson = parseLeadingJson(await recFile.text());
        recShares = analyzeRecommendations(recJson);
        notes.push(...recShares.notes, '');
      } else {
        notes.push('Файл рекомендаций не приложен — доли брака/нонсорта оставлены по умолчанию.', '');
      }
      const { scenario, summary: buildSummary } = buildScenarioFromWarehouseSchema(whJson, recShares);
      replaceScenario(scenario);
      clearSim();
      setSummary([...notes, ...buildSummary]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось разобрать файл(ы).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">Импорт из выгрузки WMS</div>

        {!summary && (
          <>
            <p className="hint-text">
              Из «Схемы склада» станции конфигуратора создаются автоматически — тысячи физических ячеек
              группируются по тегам в компактный набор станций (ворота/сортировка/хранение/...), с
              вместимостью и числом людей по количеству реальных ячеек. «Схема рекомендаций» —
              необязательный файл, из него читаются только две доли: брак и грубая оценка нонсорта
              (подробнее — во всплывающих подсказках самого сценария после генерации). На входной
              станции «Приезд грузовиков» поток делится на доли «возвраты / сорт-груз / нонсорт».
            </p>

            <div className="field-group">
              <label className="field-label">Схема склада.json (обязательно)</label>
              <input
                type="file"
                accept="application/json"
                onChange={(e) => setWarehouseFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Схема рекомендаций.json (опционально)</label>
              <input type="file" accept="application/json" onChange={(e) => setRecFile(e.target.files?.[0] ?? null)} />
            </div>

            {error && <p className="warn-badge">{error}</p>}

            <div className="prop-actions" style={{ flexDirection: 'row' }}>
              <button className="btn-primary" disabled={!warehouseFile || busy} onClick={generate}>
                {busy ? 'Генерируем…' : 'Сгенерировать сценарий'}
              </button>
              <button className="btn-secondary" onClick={onClose}>
                Отмена
              </button>
            </div>
          </>
        )}

        {summary && (
          <>
            <p className="hint-text">Готово — текущий сценарий заменён сгенерированным. Дальше можно донастроить его в конфигураторе как обычно.</p>
            <div className="wms-summary">
              {summary.map((line, i) => (line ? <p key={i}>{line}</p> : <br key={i} />))}
            </div>
            <div className="prop-actions">
              <button className="btn-primary" onClick={onClose}>
                Готово
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
