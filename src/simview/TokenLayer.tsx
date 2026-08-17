// src/simview/TokenLayer.tsx
// Слой анимированных «фишек» (грузовики/единицы груза/контейнеры/маршрутные листы),
// движущихся по рёбрам плана в момент virtualTime — рисуется поверх WarehouseCanvas.
import type { SimResult, TravelSegment } from '../engine/engine';
import { activeTravelTokens } from './liveState';

function tokenColor(seg: TravelSegment): string {
  if (seg.flow === 'ret') return '#c084fc';
  switch (seg.entityKind) {
    case 'truck':
      return '#3b82f6';
    case 'unit':
      return '#f59e0b';
    case 'container':
      return '#10b981';
    case 'mobileContainer':
      return '#22c55e';
    case 'pallet':
      return '#0891b2';
    default:
      return '#94a3b8';
  }
}

function tokenRadius(seg: TravelSegment): number {
  return seg.entityKind === 'truck' || seg.entityKind === 'returnTruck' ? 6 : 3.5;
}

export function TokenLayer({ result, t }: { result: SimResult; t: number }) {
  const stationsById = new Map(result.scenario.stations.map((s) => [s.id, s]));
  const tokens = activeTravelTokens(result, t);

  return (
    <g>
      {tokens.map((seg, i) => {
        const from = stationsById.get(seg.from);
        const to = stationsById.get(seg.to);
        if (!from || !to) return null;
        const progress = seg.t2 > seg.t1 ? Math.min(1, Math.max(0, (t - seg.t1) / (seg.t2 - seg.t1))) : 1;
        const fx = from.x + from.w / 2;
        const fy = from.y + from.h / 2;
        const tx = to.x + to.w / 2;
        const ty = to.y + to.h / 2;
        const x = fx + (tx - fx) * progress;
        const y = fy + (ty - fy) * progress;
        return (
          <circle
            key={`${seg.entityId}-${seg.from}-${seg.to}-${i}`}
            cx={x}
            cy={y}
            r={tokenRadius(seg)}
            fill={tokenColor(seg)}
            stroke="#0f172a"
            strokeWidth={0.6}
          />
        );
      })}
    </g>
  );
}
