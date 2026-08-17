// src/editor/PrototypeEditorDialog.tsx
// Управление личной библиотекой прототипов станций: список слева (создать/выбрать/удалить),
// форма редактирования выбранного справа. Прототип — это только общие параметры (люди/время
// обслуживания/размер партии/лимит очереди) + имя/описание/цвет; специфичного поведения не несёт,
// станция из прототипа всегда получает type:'custom' (passthrough, см. domain/behaviors.ts).
import { useState } from 'react';
import type { StationPrototype } from '../domain/types';
import { usePrototypeStore, newPrototypeDraft } from '../store/prototypeStore';
import { DistributionEditor } from './DistributionEditor';

type Draft = Omit<StationPrototype, 'id'>;

export function PrototypeEditorDialog({ onClose }: { onClose: () => void }) {
  const prototypes = usePrototypeStore((s) => s.prototypes);
  const addPrototype = usePrototypeStore((s) => s.addPrototype);
  const updatePrototype = usePrototypeStore((s) => s.updatePrototype);
  const removePrototype = usePrototypeStore((s) => s.removePrototype);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(newPrototypeDraft());

  const startNew = () => {
    setEditingId(null);
    setDraft(newPrototypeDraft());
  };
  const startEdit = (p: StationPrototype) => {
    setEditingId(p.id);
    const { id: _id, ...rest } = p;
    setDraft(rest);
  };
  const save = () => {
    if (!draft.name.trim()) return;
    if (editingId) updatePrototype(editingId, draft);
    else {
      const id = addPrototype(draft);
      setEditingId(id);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel proto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">Мои прототипы станций</div>
        <p className="hint-text">
          Прототип — это шаблон «своей» станции (общие параметры + имя/описание/цвет), сохраняется в личной
          библиотеке и доступен во всех сценариях через палитру. Поведение всегда простое — станция принимает
          сущности и отдаёт дальше по связям, без специфичной логики.
        </p>

        <div className="proto-layout">
          <div className="proto-list">
            <button className="btn-secondary proto-new-btn" onClick={startNew}>
              + Новый прототип
            </button>
            {prototypes.length === 0 && <p className="hint-text">Пока пусто.</p>}
            {prototypes.map((p) => (
              <div key={p.id} className={`proto-list-item ${editingId === p.id ? 'active' : ''}`} onClick={() => startEdit(p)}>
                <span className="palette-dot" style={{ background: p.color }} />
                <span className="proto-list-name">{p.name}</span>
                <button
                  className="compare-remove"
                  title="Удалить прототип"
                  onClick={(e) => {
                    e.stopPropagation();
                    removePrototype(p.id);
                    if (editingId === p.id) startNew();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="proto-form">
            <div className="field-group">
              <label className="field-label">Название</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">Описание (подсказка в панели параметров)</label>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="field-group inline">
              <label className="field-label">Цвет</label>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
            </div>
            <div className="field-group inline">
              <label className="field-label">Людей (одновременно работают)</label>
              <input
                type="number"
                min={1}
                value={draft.common.resourceCount}
                onChange={(e) => setDraft({ ...draft, common: { ...draft.common, resourceCount: parseInt(e.target.value) || 1 } })}
              />
            </div>
            <DistributionEditor
              label="Время обслуживания"
              unit="ч"
              value={draft.common.serviceTime}
              onChange={(d) => setDraft({ ...draft, common: { ...draft.common, serviceTime: d } })}
            />
            <div className="field-group inline">
              <label className="field-label">Размер партии (batch)</label>
              <input
                type="number"
                min={1}
                value={draft.common.batchIn}
                onChange={(e) => setDraft({ ...draft, common: { ...draft.common, batchIn: parseInt(e.target.value) || 1 } })}
              />
            </div>
            <div className="field-group inline">
              <label className="field-label">Лимит очереди</label>
              <input
                type="number"
                min={0}
                placeholder="без лимита"
                value={draft.common.queueCapacity ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, common: { ...draft.common, queueCapacity: e.target.value ? parseInt(e.target.value) : undefined } })
                }
              />
            </div>

            <div className="prop-actions">
              <button className="btn-primary" disabled={!draft.name.trim()} onClick={save}>
                {editingId ? 'Сохранить прототип' : 'Создать прототип'}
              </button>
            </div>
          </div>
        </div>

        <div className="prop-actions" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
