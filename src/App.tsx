// src/App.tsx
// Точка входа UI: верхний тулбар (сценарий, импорт/экспорт/сброс) + переключатель вкладок
// «Конфигуратор / Моделирование / Статистика».
import { useRef, useState } from 'react';
import './App.css';
import { useScenarioStore } from './store/scenarioStore';
import { useSimStore } from './store/simStore';
import { EditorPage } from './editor/EditorPage';
import { SimPage } from './simview/SimPage';
import { StatsPanel } from './dashboard/StatsPanel';
import type { Scenario } from './domain/types';
import { downloadFile } from './lib/download';

type Tab = 'editor' | 'sim' | 'stats';

function App() {
  const [tab, setTab] = useState<Tab>('editor');
  const scenario = useScenarioStore((s) => s.scenario);
  const replaceScenario = useScenarioStore((s) => s.replaceScenario);
  const resetToDefault = useScenarioStore((s) => s.resetToDefault);
  const clearSim = useSimStore((s) => s.clear);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onImport = (file: File) => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Scenario;
        if (!parsed.stations || !parsed.edges) throw new Error('invalid');
        replaceScenario(parsed);
        clearSim();
      } catch {
        alert('Не удалось прочитать файл сценария — проверьте формат JSON.');
      }
    });
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">🏭 Моделирование склада</div>
        <nav className="tab-nav">
          <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>
            Конфигуратор
          </button>
          <button className={tab === 'sim' ? 'active' : ''} onClick={() => setTab('sim')}>
            Моделирование
          </button>
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
            Статистика
          </button>
        </nav>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={() =>
              downloadFile(`${scenario.name || 'scenario'}.json`, JSON.stringify(scenario, null, 2), 'application/json')
            }
          >
            Экспорт
          </button>
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Импорт
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Сбросить сценарий к типовому примеру? Текущие правки будут потеряны.')) {
                resetToDefault();
                clearSim();
              }
            }}
          >
            Сбросить
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === 'editor' && <EditorPage />}
        {tab === 'sim' && <SimPage />}
        {tab === 'stats' && <StatsPanel />}
      </main>
    </div>
  );
}

export default App;
