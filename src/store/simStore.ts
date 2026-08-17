// src/store/simStore.ts
// Состояние прогона симуляции: сам результат (лог событий на всю длительность) + состояние
// плеера (воспроизведение результата в реальном времени с управляемой скоростью). Симуляция
// считается один раз целиком (см. engine/engine.ts) — плеер лишь «прокручивает» время по логу.
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Scenario } from '../domain/types';
import { runSimulation, type SimResult } from '../engine/engine';

export interface RunHistoryEntry {
  id: string;
  label: string;
  savedAt: number;
  result: SimResult;
}

const MAX_HISTORY = 6;

interface SimState {
  result: SimResult | null;
  running: boolean;
  virtualTime: number; // часы модельного времени, текущая позиция плеера
  playing: boolean;
  speed: number; // модельных часов в секунду реального времени
  history: RunHistoryEntry[]; // сохранённые прогоны для сравнения (не сбрасываются вместе с result)
  run: (scenario: Scenario) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (s: number) => void;
  setVirtualTime: (t: number) => void;
  clear: () => void;
  saveToHistory: (label: string) => void;
  removeFromHistory: (id: string) => void;
}

export const useSimStore = create<SimState>((set, get) => ({
  result: null,
  running: false,
  virtualTime: 0,
  playing: false,
  speed: 20,
  history: [],
  run: (scenario) => {
    set({ running: true });
    // небольшая пауза для отрисовки состояния "считаем" при больших сценариях не требуется —
    // движок синхронный и обычно укладывается в десятки/сотни мс.
    const result = runSimulation(scenario);
    set({ result, running: false, virtualTime: 0, playing: false });
  },
  play: () => {
    if (get().result) set({ playing: true });
  },
  pause: () => set({ playing: false }),
  setSpeed: (s) => set({ speed: Math.max(0.1, s) }),
  setVirtualTime: (t) => {
    const end = get().result?.endTime ?? 0;
    const clamped = Math.max(0, Math.min(t, end));
    set({ virtualTime: clamped, playing: clamped >= end ? false : get().playing });
  },
  clear: () => set({ result: null, virtualTime: 0, playing: false }),
  saveToHistory: (label) => {
    const result = get().result;
    if (!result) return;
    const entry: RunHistoryEntry = {
      id: nanoid(6),
      label: label.trim() || `Прогон ${get().history.length + 1}`,
      savedAt: Date.now(),
      result,
    };
    set({ history: [...get().history, entry].slice(-MAX_HISTORY) });
  },
  removeFromHistory: (id) => set({ history: get().history.filter((h) => h.id !== id) }),
}));
