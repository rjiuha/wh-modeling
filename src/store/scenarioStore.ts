// src/store/scenarioStore.ts
// Состояние редактируемого сценария (конфигуратор). Персистится в localStorage, чтобы
// правки не терялись между перезагрузками страницы. Импорт/экспорт — обычные JSON-файлы.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Edge, Scenario, Station, StationType } from '../domain/types';
import { buildDefaultScenario } from '../domain/defaultScenario';

const BATCHING_TYPES: StationType[] = ['pack', 'mobileContainer', 'palletize', 'shipTruck', 'shipCourier'];

// Экспортируется — переиспользуется генератором сценария из выгрузки WMS (domain/wmsImport.ts),
// чтобы не дублировать параметры «по умолчанию» для каждого типа станции ещё раз.
export function defaultStationParams(type: StationType): Pick<Station, 'common' | 'source' | 'sort' | 'returnsInspect'> {
  const isSource = type === 'sourceForward' || type === 'sourceReturn';
  return {
    common: {
      resourceCount: isSource ? 1 : 2,
      serviceTime: isSource ? { kind: 'const', value: 0 } : { kind: 'triangular', min: 0.05, mode: 0.1, max: 0.2 },
      batchIn: BATCHING_TYPES.includes(type) ? 5 : 1,
    },
    source: isSource
      ? {
          interarrival: { kind: 'exponential', mean: 0.5 },
          unitsPerTruck: { kind: 'uniform', min: 10, max: 40 },
          nonsortShare: 0.4,
          crossdockShare: type === 'sourceForward' ? 0.15 : 0,
        }
      : undefined,
    sort:
      type === 'sort'
        ? {
            nonsortDestinationMix: { local: 0.7, truck: 0.3 },
            sortDestinationMix: { local: 0.5, truck: 0.5 },
          }
        : undefined,
    returnsInspect: type === 'returnsInspect' ? { damagedShare: 0.15 } : undefined,
  };
}

interface ScenarioState {
  scenario: Scenario;
  selectedId: string | null; // station or edge id
  setSelected: (id: string | null) => void;
  replaceScenario: (s: Scenario) => void;
  resetToDefault: () => void;
  updateScenarioMeta: (patch: Partial<Pick<Scenario, 'name' | 'seed' | 'durationHours'>>) => void;
  addStation: (
    type: StationType,
    x: number,
    y: number,
    overrides?: Partial<Pick<Station, 'name' | 'color' | 'description' | 'common'>>,
  ) => string;
  updateStation: (id: string, patch: Partial<Station>) => void;
  moveStation: (id: string, x: number, y: number) => void;
  removeStation: (id: string) => void;
  addEdge: (from: string, to: string) => string;
  updateEdge: (id: string, patch: Partial<Edge>) => void;
  removeEdge: (id: string) => void;
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set, get) => ({
      scenario: buildDefaultScenario(),
      selectedId: null,
      setSelected: (id) => set({ selectedId: id }),
      replaceScenario: (s) => set({ scenario: s, selectedId: null }),
      resetToDefault: () => set({ scenario: buildDefaultScenario(), selectedId: null }),
      updateScenarioMeta: (patch) => set((st) => ({ scenario: { ...st.scenario, ...patch } })),
      addStation: (type, x, y, overrides) => {
        const id = `st_${nanoid(6)}`;
        const station: Station = {
          id,
          type,
          name: overrides?.name ?? id,
          x,
          y,
          w: 160,
          h: 84,
          ...defaultStationParams(type),
          ...(overrides?.common ? { common: overrides.common } : {}),
          ...(overrides?.color ? { color: overrides.color } : {}),
          ...(overrides?.description ? { description: overrides.description } : {}),
        };
        set((st) => ({ scenario: { ...st.scenario, stations: [...st.scenario.stations, station] }, selectedId: id }));
        return id;
      },
      updateStation: (id, patch) =>
        set((st) => ({
          scenario: {
            ...st.scenario,
            stations: st.scenario.stations.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          },
        })),
      moveStation: (id, x, y) =>
        set((st) => ({
          scenario: { ...st.scenario, stations: st.scenario.stations.map((s) => (s.id === id ? { ...s, x, y } : s)) },
        })),
      removeStation: (id) =>
        set((st) => ({
          scenario: {
            ...st.scenario,
            stations: st.scenario.stations.filter((s) => s.id !== id),
            edges: st.scenario.edges.filter((e) => e.from !== id && e.to !== id),
          },
          selectedId: get().selectedId === id ? null : get().selectedId,
        })),
      addEdge: (from, to) => {
        const id = `ed_${nanoid(6)}`;
        const edge: Edge = { id, from, to, weight: 1 };
        set((st) => ({ scenario: { ...st.scenario, edges: [...st.scenario.edges, edge] }, selectedId: id }));
        return id;
      },
      updateEdge: (id, patch) =>
        set((st) => ({
          scenario: { ...st.scenario, edges: st.scenario.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
        })),
      removeEdge: (id) =>
        set((st) => ({
          scenario: { ...st.scenario, edges: st.scenario.edges.filter((e) => e.id !== id) },
          selectedId: get().selectedId === id ? null : get().selectedId,
        })),
    }),
    { name: 'wh-modeling-scenario' },
  ),
);
