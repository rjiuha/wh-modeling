// src/simview/SimPage.tsx
// Страница «Моделирование»: план склада (только чтение) с живой анимацией токенов и
// счётчиками очередей/занятости, управление воспроизведением, кнопка запуска расчёта.
import { useEffect, useRef } from 'react';
import { useScenarioStore } from '../store/scenarioStore';
import { useSimStore } from '../store/simStore';
import { WarehouseCanvas } from '../editor/WarehouseCanvas';
import { TokenLayer } from './TokenLayer';
import { PlaybackControls } from './PlaybackControls';
import { stationLiveCounts } from './liveState';

function usePlaybackClock() {
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const setVirtualTime = useSimStore((s) => s.setVirtualTime);
  const vtRef = useRef(useSimStore.getState().virtualTime);

  useEffect(() => useSimStore.subscribe((s) => { vtRef.current = s.virtualTime; }), []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dtReal = (now - last) / 1000;
      last = now;
      setVirtualTime(vtRef.current + dtReal * speed);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, setVirtualTime]);
}

export function SimPage() {
  const scenario = useScenarioStore((s) => s.scenario);
  const result = useSimStore((s) => s.result);
  const running = useSimStore((s) => s.running);
  const virtualTime = useSimStore((s) => s.virtualTime);
  const run = useSimStore((s) => s.run);

  usePlaybackClock();

  const liveCounts = result ? stationLiveCounts(result, virtualTime) : undefined;

  return (
    <div className="sim-layout">
      <div className="sim-toolbar">
        <button className="btn-primary" disabled={running} onClick={() => run(scenario)}>
          {running ? 'Считаем…' : result ? '↻ Пересчитать сценарий' : '▶ Запустить моделирование'}
        </button>
        {!result && <span className="hint-text">Сценарий: «{scenario.name}», {scenario.durationHours} ч модельного времени</span>}
      </div>

      {result && <PlaybackControls />}

      <div className="sim-canvas-wrap">
        <WarehouseCanvas scenario={scenario} liveCounts={liveCounts}>
          {result && <TokenLayer result={result} t={virtualTime} />}
        </WarehouseCanvas>
      </div>
    </div>
  );
}
