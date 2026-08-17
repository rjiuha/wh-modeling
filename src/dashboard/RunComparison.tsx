// src/dashboard/RunComparison.tsx
// Сравнение сохранённых прогонов бок о бок — сохрани прогон, поменяй параметры в конфигураторе,
// прогони снова и сохрани ещё раз (например, «было» vs «6 человек на сортировке»).
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimStore } from '../store/simStore';
import { outboundTotals, summarizeStations } from './stats';

const RUN_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#22d3ee'];

function SaveRow({ onSave }: { onSave: (label: string) => void }) {
  const [label, setLabel] = useState('');
  return (
    <div className="compare-save-row">
      <input
        placeholder='название прогона, например «6 человек на сортировке»'
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <button
        className="btn-secondary"
        onClick={() => {
          onSave(label);
          setLabel('');
        }}
      >
        + Сохранить текущий для сравнения
      </button>
    </div>
  );
}

export function RunComparison() {
  const result = useSimStore((s) => s.result);
  const history = useSimStore((s) => s.history);
  const saveToHistory = useSimStore((s) => s.saveToHistory);
  const removeFromHistory = useSimStore((s) => s.removeFromHistory);

  if (history.length === 0) {
    return (
      <div className="chart-box compare-box">
        <div className="panel-title">Сравнение прогонов</div>
        <p className="hint-text">
          Сохраните текущий прогон, поменяйте параметры в конфигураторе (например, число людей на узкой станции),
          прогоните заново и сохраните ещё раз — здесь появится таблица и график бок о бок.
        </p>
        {result && <SaveRow onSave={saveToHistory} />}
      </div>
    );
  }

  const rows = history.map((h) => {
    const totals = outboundTotals(h.result);
    const stations = summarizeStations(h.result);
    const bottleneck = stations.reduce((max, s) => (s.utilizationPct > (max?.utilizationPct ?? -1) ? s : max), stations[0]);
    return { ...h, totals, bottleneck };
  });

  const metricRows: { label: string; get: (r: (typeof rows)[number]) => string }[] = [
    { label: 'Грузовиков приехало', get: (r) => String(r.totals.trucksArrivedFwd) },
    { label: 'Возвратов приехало', get: (r) => String(r.totals.trucksArrivedRet) },
    { label: 'Отгружено грузовиками', get: (r) => String(r.totals.shippedTruck) },
    { label: 'Маршрутных листов', get: (r) => String(r.totals.shippedCourier) },
    { label: 'Восстановлено', get: (r) => String(r.totals.restocked) },
    { label: 'Списано', get: (r) => String(r.totals.writtenOff) },
    { label: 'Самая загруженная станция', get: (r) => `${r.bottleneck?.name ?? '—'} (${r.bottleneck?.utilizationPct.toFixed(0) ?? 0}%)` },
    { label: 'Модельное время (ч)', get: (r) => r.result.endTime.toFixed(1) },
  ];

  const chartMetrics: [string, (t: ReturnType<typeof outboundTotals>) => number][] = [
    ['Отгружено грузовиками', (t) => t.shippedTruck],
    ['Маршрутных листов', (t) => t.shippedCourier],
    ['Списано', (t) => t.writtenOff],
  ];
  const chartData = chartMetrics.map(([metricLabel, pick]) => {
    const point: Record<string, string | number> = { metric: metricLabel };
    for (const r of rows) point[r.id] = pick(r.totals);
    return point;
  });

  return (
    <div className="chart-box compare-box">
      <div className="panel-title-row">
        <span className="panel-title">Сравнение прогонов</span>
      </div>
      {result && <SaveRow onSave={saveToHistory} />}

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis dataKey="metric" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {rows.map((r, i) => (
            <Bar key={r.id} dataKey={r.id} name={r.label} fill={RUN_COLORS[i % RUN_COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="station-table-wrap">
        <table className="station-table">
          <thead>
            <tr>
              <th>Метрика</th>
              {rows.map((r) => (
                <th key={r.id}>
                  {r.label}
                  <button className="compare-remove" title="Убрать из сравнения" onClick={() => removeFromHistory(r.id)}>
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((mr) => (
              <tr key={mr.label}>
                <td>{mr.label}</td>
                {rows.map((r) => (
                  <td key={r.id}>{mr.get(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
