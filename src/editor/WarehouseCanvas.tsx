// src/editor/WarehouseCanvas.tsx
// Общий 2D-план склада на SVG — используется и конфигуратором (перетаскивание станций,
// рисование рёбер), и вьюером симуляции (только чтение + слой анимированных токенов поверх).
// Поддерживает зум колесом мыши (к курсору) и панорамирование перетаскиванием пустой области —
// реализовано трансформом (translate+scale) внутренней группы, а не браузерным скроллом, так что
// работает одинаково в обеих раскладках (конфигуратор/симуляция) и не завязано на overflow контейнера.
import { useEffect, useRef, useState } from 'react';
import type { Edge, EdgeWhen, Scenario, Station } from '../domain/types';
import {
  CONDITION_LABELS,
  DESTINATION_LABELS,
  FLOW_LABELS,
  SORT_TYPE_LABELS,
  STATION_COLORS,
  STATION_LABELS,
} from '../domain/types';

const SHORT_FLOW: Record<string, string> = { fwd: 'прямой', ret: 'возврат' };
const SHORT_SORT: Record<string, string> = { sort: 'сорт', nonsort: 'нонсорт', crossdock: 'кросс-док' };
const SHORT_DEST: Record<string, string> = { local: 'локально', truck: 'грузовиком' };
const SHORT_COND: Record<string, string> = { good: 'исправно', damaged: 'брак' };

export function formatEdgeWhen(when: EdgeWhen | undefined): string | null {
  if (!when) return null;
  const parts: string[] = [];
  if (when.flow) parts.push(SHORT_FLOW[when.flow] ?? when.flow);
  if (when.sortType) parts.push(SHORT_SORT[when.sortType] ?? when.sortType);
  if (when.destination) parts.push(SHORT_DEST[when.destination] ?? when.destination);
  if (when.condition) parts.push(SHORT_COND[when.condition] ?? when.condition);
  if (when.kind) parts.push(when.kind);
  return parts.length ? parts.join(' · ') : null;
}

export function fullEdgeWhenDescription(edge: Edge): string {
  if (!edge.when) return 'Без условия — принимает все сущности (среди подходящих делится по весу).';
  const bits: string[] = [];
  if (edge.when.flow) bits.push(`поток: ${FLOW_LABELS[edge.when.flow]}`);
  if (edge.when.sortType) bits.push(`тип груза: ${SORT_TYPE_LABELS[edge.when.sortType]}`);
  if (edge.when.destination) bits.push(`назначение: ${DESTINATION_LABELS[edge.when.destination]}`);
  if (edge.when.condition) bits.push(`состояние: ${CONDITION_LABELS[edge.when.condition]}`);
  return `Подходит, если ${bits.join(', ')}.`;
}

export const CANVAS_W = 1520;
export const CANVAS_H = 660;

const MIN_SCALE = 0.35;
const MAX_SCALE = 3;

function clipToRect(cx: number, cy: number, w: number, h: number, tx: number, ty: number): [number, number] {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = w / 2;
  const hh = h / 2;
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return [cx + dx * scale, cy + dy * scale];
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// SVG <text> не переносится и не обрезается по границе сам — длинные названия станций (особенно
// сгенерированные импортом из WMS, вида «Формирование мобильных контейнеров (736 яч.)») иначе
// вылезают за рамку. Грубая оценка по среднему числу символов на пиксель ширины шрифта — не
// идеально точно (моноширинным не является), но заведомо безопасно с запасом; clipPath на самой
// станции — дополнительная страховка на случай, если оценка всё же промахнётся.
function truncateForWidth(text: string, maxWidth: number, avgCharWidth: number): string {
  const maxChars = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function stationAt(stations: Station[], x: number, y: number, excludeId?: string): Station | undefined {
  return stations.find((s) => s.id !== excludeId && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
}

// <svg> рендерится с дефолтным preserveAspectRatio="xMidYMid meet" — единый масштаб по обеим осям
// плюс возможный отступ (леттербоксинг), если пропорции контейнера отличаются от viewBox. Функции
// ниже — точное обращение этого преобразования, чтобы клики/драг/зум совпадали с тем, что видно на
// экране (независимое масштабирование по осям исказило бы картинку — квадратные станции стали бы
// прямоугольными, текст сплющился бы).
function viewportScale(rect: { width: number; height: number }): number {
  return Math.min(rect.width / CANVAS_W, rect.height / CANVAS_H);
}
function screenToViewport(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) {
  const scale = viewportScale(rect);
  const offsetX = rect.left + (rect.width - CANVAS_W * scale) / 2;
  const offsetY = rect.top + (rect.height - CANVAS_H * scale) / 2;
  return { x: (clientX - offsetX) / scale, y: (clientY - offsetY) / scale };
}
function screenDeltaToViewport(rect: { width: number; height: number }, dxClient: number, dyClient: number) {
  const scale = viewportScale(rect);
  return { dx: dxClient / scale, dy: dyClient / scale };
}

interface Props {
  scenario: Scenario;
  selectedId?: string | null;
  onSelectStation?: (id: string) => void;
  onSelectEdge?: (id: string) => void;
  onMoveStation?: (id: string, x: number, y: number) => void;
  onCanvasClick?: () => void;
  edgeDraftFrom?: string | null;
  onStationClickForEdge?: (id: string) => void;
  onCreateEdge?: (from: string, to: string) => void;
  children?: React.ReactNode;
  liveCounts?: Record<string, { queue: number; busy: number }>;
}

interface EdgeDragState {
  fromId: string;
  fromPoint: { x: number; y: number };
  current: { x: number; y: number };
  targetId: string | null;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const DEFAULT_VIEW: View = { x: 0, y: 0, scale: 1 };

export function WarehouseCanvas({
  scenario,
  selectedId,
  onSelectStation,
  onSelectEdge,
  onMoveStation,
  onCanvasClick,
  edgeDraftFrom,
  onStationClickForEdge,
  onCreateEdge,
  children,
  liveCounts,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [panning, setPanning] = useState<{ clientX: number; clientY: number; viewX: number; viewY: number } | null>(null);
  const [edgeDrag, setEdgeDrag] = useState<EdgeDragState | null>(null);
  const clickSuppressed = useRef(false);

  // Точка в системе координат viewBox (не зависит от zoom/pan — только от размера самого <svg>).
  const toViewportPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return screenToViewport(rect, clientX, clientY);
  };

  // Точка в системе координат содержимого (то, в чём заданы x/y станций) — с учётом текущего зума/пана.
  const toCanvasPoint = (clientX: number, clientY: number) => {
    const p = toViewportPoint(clientX, clientY);
    const v = viewRef.current;
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
  };

  const zoomAt = (viewportX: number, viewportY: number, factor: number) => {
    setView((v) => {
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const canvasX = (viewportX - v.x) / v.scale;
      const canvasY = (viewportY - v.y) / v.scale;
      return { scale: newScale, x: viewportX - canvasX * newScale, y: viewportY - canvasY * newScale };
    });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const p = screenToViewport(rect, e.clientX, e.clientY);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stationsById = new Map(scenario.stations.map((s) => [s.id, s]));

  // Несколько рёбер между одной и той же парой станций (например, gate->sort «сорт» и «нонсорт»)
  // иначе рисовались бы точно друг на друге — сносим их в стороны дугой и разносим подписи.
  const edgeGroups = new Map<string, string[]>();
  for (const e of scenario.edges) {
    const key = `${e.from}->${e.to}`;
    const arr = edgeGroups.get(key) ?? [];
    arr.push(e.id);
    edgeGroups.set(key, arr);
  }
  // На кривой Безье пик отклоняется от прямой только на половину смещения контрольной точки,
  // поэтому константа больше желаемого видимого зазора между соседними рёбрами в группе.
  const EDGE_SPACING = 40;

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="wh-canvas"
        onClick={() => {
          if (clickSuppressed.current) {
            clickSuppressed.current = false;
            return;
          }
          onCanvasClick?.();
        }}
        onPointerMove={(e) => {
          if (edgeDrag) {
            const p = toCanvasPoint(e.clientX, e.clientY);
            const target = stationAt(scenario.stations, p.x, p.y, edgeDrag.fromId);
            setEdgeDrag({ ...edgeDrag, current: p, targetId: target?.id ?? null });
            return;
          }
          if (drag && onMoveStation) {
            const p = toCanvasPoint(e.clientX, e.clientY);
            onMoveStation(drag.id, p.x - drag.dx, p.y - drag.dy);
            return;
          }
          if (panning) {
            const dxClient = e.clientX - panning.clientX;
            const dyClient = e.clientY - panning.clientY;
            const rect = svgRef.current!.getBoundingClientRect();
            const { dx, dy } = screenDeltaToViewport(rect, dxClient, dyClient);
            if (Math.abs(dxClient) > 2 || Math.abs(dyClient) > 2) clickSuppressed.current = true;
            setView({ ...viewRef.current, x: panning.viewX + dx, y: panning.viewY + dy });
          }
        }}
        onPointerUp={() => {
          if (edgeDrag) {
            clickSuppressed.current = true;
            if (edgeDrag.targetId) onCreateEdge?.(edgeDrag.fromId, edgeDrag.targetId);
            setEdgeDrag(null);
          }
          setDrag(null);
          setPanning(null);
        }}
        onPointerLeave={() => {
          setEdgeDrag(null);
          setDrag(null);
          setPanning(null);
        }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--edge-color)" />
          </marker>
        </defs>

        <rect
          x={0}
          y={0}
          width={CANVAS_W}
          height={CANVAS_H}
          fill="var(--canvas-bg)"
          onPointerDown={(e) => {
            clickSuppressed.current = false;
            setPanning({ clientX: e.clientX, clientY: e.clientY, viewX: view.x, viewY: view.y });
          }}
          style={{ cursor: panning ? 'grabbing' : 'grab' }}
        />

        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          {/* Рёбра */}
          <g>
            {scenario.edges.map((edge) => {
              const from = stationsById.get(edge.from);
              const to = stationsById.get(edge.to);
              if (!from || !to) return null;
              const fromC = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
              const toC = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
              const p1 = clipToRect(fromC.x, fromC.y, from.w, from.h, toC.x, toC.y);
              const p2 = clipToRect(toC.x, toC.y, to.w, to.h, fromC.x, fromC.y);
              const isSelected = selectedId === edge.id;
              const label = formatEdgeWhen(edge.when);

              const group = edgeGroups.get(`${edge.from}->${edge.to}`) ?? [edge.id];
              const idxInGroup = group.indexOf(edge.id);
              const offsetAmount = (idxInGroup - (group.length - 1) / 2) * EDGE_SPACING;

              let pathD: string;
              let labelPos: { x: number; y: number };
              if (offsetAmount === 0) {
                pathD = `M${p1[0]},${p1[1]} L${p2[0]},${p2[1]}`;
                labelPos = { x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2 };
              } else {
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                const len = Math.hypot(dx, dy) || 1;
                const perp = { x: -dy / len, y: dx / len };
                const mid = { x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2 };
                const ctrl = { x: mid.x + perp.x * offsetAmount, y: mid.y + perp.y * offsetAmount };
                pathD = `M${p1[0]},${p1[1]} Q${ctrl.x},${ctrl.y} ${p2[0]},${p2[1]}`;
                // Точка на квадратичной кривой при t=0.5 — визуальная середина дуги.
                labelPos = {
                  x: 0.25 * p1[0] + 0.5 * ctrl.x + 0.25 * p2[0],
                  y: 0.25 * p1[1] + 0.5 * ctrl.y + 0.25 * p2[1],
                };
              }

              return (
                <g
                  key={edge.id}
                  className="edge-group"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEdge?.(edge.id);
                  }}
                >
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? 'var(--edge-selected)' : 'var(--edge-color)'}
                    strokeWidth={isSelected ? 3 : 1.6}
                    markerEnd="url(#arrow)"
                  />
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth={14} />
                  {label && (
                    <text x={labelPos.x} y={labelPos.y - 4} className="edge-label">
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Станции */}
          <g>
            {scenario.stations.map((s) => {
              const isSelected = selectedId === s.id;
              const isEdgeDraftSource = edgeDraftFrom === s.id || edgeDrag?.fromId === s.id;
              const isEdgeDropTarget = edgeDrag?.targetId === s.id;
              const counts = liveCounts?.[s.id];
              const color = s.color ?? STATION_COLORS[s.type];
              const textWidth = s.w - 22;
              const title = truncateForWidth(s.name, textWidth, 7.5);
              const subtitle = truncateForWidth(STATION_LABELS[s.type], textWidth, 6);
              return (
                <g
                  key={s.id}
                  transform={`translate(${s.x},${s.y})`}
                  className="station-group"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (edgeDraftFrom) onStationClickForEdge?.(s.id);
                    else onSelectStation?.(s.id);
                  }}
                  onPointerDown={(e) => {
                    if (edgeDraftFrom || !onMoveStation) return;
                    e.stopPropagation();
                    const p = toCanvasPoint(e.clientX, e.clientY);
                    setDrag({ id: s.id, dx: p.x - s.x, dy: p.y - s.y });
                  }}
                  style={{ cursor: onMoveStation ? 'grab' : 'pointer' }}
                >
                  <defs>
                    <clipPath id={`clip-${s.id}`}>
                      <rect width={s.w} height={s.h} rx={10} />
                    </clipPath>
                  </defs>
                  <rect
                    width={s.w}
                    height={s.h}
                    rx={10}
                    fill={color}
                    fillOpacity={isEdgeDropTarget ? 0.35 : 0.18}
                    stroke={isEdgeDropTarget ? '#22d3ee' : isSelected ? 'var(--edge-selected)' : isEdgeDraftSource ? '#22d3ee' : color}
                    strokeWidth={isSelected || isEdgeDraftSource || isEdgeDropTarget ? 3 : 1.6}
                  />
                  <rect x={0} y={0} width={6} height={s.h} rx={3} fill={color} />
                  <g clipPath={`url(#clip-${s.id})`}>
                    <text x={14} y={22} className="station-title">
                      {title}
                    </text>
                    <text x={14} y={38} className="station-subtitle">
                      {subtitle}
                    </text>
                    {counts && (
                      <text x={14} y={s.h - 12} className="station-counts">
                        {truncateForWidth(`очередь ${counts.queue} · занято ${counts.busy}/${s.common.resourceCount}`, textWidth, 6)}
                      </text>
                    )}
                  </g>
                  {onCreateEdge && (
                    <circle
                      className="edge-handle"
                      cx={s.w}
                      cy={s.h / 2}
                      r={7}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const fromPoint = { x: s.x + s.w, y: s.y + s.h / 2 };
                        setEdgeDrag({ fromId: s.id, fromPoint, current: fromPoint, targetId: null });
                      }}
                    >
                      <title>Потяните на другую станцию, чтобы создать связь</title>
                    </circle>
                  )}
                </g>
              );
            })}
          </g>

          {edgeDrag && (
            <line
              x1={edgeDrag.fromPoint.x}
              y1={edgeDrag.fromPoint.y}
              x2={edgeDrag.current.x}
              y2={edgeDrag.current.y}
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray="5 4"
              markerEnd="url(#arrow)"
            />
          )}

          {children}
        </g>
      </svg>

      <div className="zoom-controls">
        <button title="Приблизить" onClick={() => zoomAt(CANVAS_W / 2, CANVAS_H / 2, 1.25)}>
          +
        </button>
        <button title="Отдалить" onClick={() => zoomAt(CANVAS_W / 2, CANVAS_H / 2, 1 / 1.25)}>
          −
        </button>
        <button title="Сбросить масштаб" onClick={() => setView(DEFAULT_VIEW)}>
          {Math.round(view.scale * 100)}%
        </button>
      </div>
    </>
  );
}
