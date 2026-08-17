// src/store/prototypeStore.ts
// Библиотека пользовательских прототипов станций — глобальная, персистится отдельно от
// сценария (своя запись в localStorage), доступна во всех сценариях как личный каталог
// компонентов. Каждый прототип создаёт станцию с type:'custom' (см. domain/behaviors.ts —
// простой passthrough), шаблонируя имя/описание/цвет/общие параметры.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { StationPrototype } from '../domain/types';

const DEFAULT_COLOR = '#9ca3af';

function defaultPrototypeCommon(): StationPrototype['common'] {
  return {
    resourceCount: 2,
    serviceTime: { kind: 'triangular', min: 0.05, mode: 0.1, max: 0.2 },
    batchIn: 1,
  };
}

interface PrototypeState {
  prototypes: StationPrototype[];
  addPrototype: (p: Omit<StationPrototype, 'id'>) => string;
  updatePrototype: (id: string, patch: Partial<Omit<StationPrototype, 'id'>>) => void;
  removePrototype: (id: string) => void;
}

export const usePrototypeStore = create<PrototypeState>()(
  persist(
    (set) => ({
      prototypes: [],
      addPrototype: (p) => {
        const id = `proto_${nanoid(6)}`;
        set((st) => ({ prototypes: [...st.prototypes, { ...p, id }] }));
        return id;
      },
      updatePrototype: (id, patch) =>
        set((st) => ({ prototypes: st.prototypes.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removePrototype: (id) => set((st) => ({ prototypes: st.prototypes.filter((p) => p.id !== id) })),
    }),
    { name: 'wh-modeling-prototypes' },
  ),
);

export function newPrototypeDraft(): Omit<StationPrototype, 'id'> {
  return { name: 'Новый прототип', description: '', color: DEFAULT_COLOR, common: defaultPrototypeCommon() };
}
