// src/dashboard/StatsPanel.tsx
// Дашборд по итогам полного прогона: сводные счётчики, загрузка станций, очереди во времени.
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimStore } from '../store/simStore';
import { downsampleQueueSeries, outboundTotals, summarizeStations } from './stats';
import { buildStatsCsv } from './csvExport';
import { downloadFile } from '../lib/download';
import { RunComparison } from './RunComparison';

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

export function StatsPanel() {
  const result = useSimStore((s) => s.result);
  const history = useSimStore((s) => s.history);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  if (!result && history.length === 0) {
    return (
      <div className="dashboard-empty">
        <p className="hint-text">Запустите моделирование, чтобы увидеть статистику.</p>
      </div>
    );
  }

  if (!result) {
    // Текущего прогона нет (сброшен/сценарий импортирован заново), но есть сохранённые для сравнения.
    return (
      <div className="dashboard">
        <RunComparison />
      </div>
    );
  }

  const totals = outboundTotals(result);
  const stationSummary = summarizeStations(result);
  const stationId = selectedStation ?? stationSummary[0]?.id;
  const series = stationId ? downsampleQueueSeries(result, stationId) : [];

  const outboundData = [
    { name: 'Грузовиками', value: totals.shippedTruck },
    { name: 'Курьерами (маршр. листы)', value: totals.shippedCourier },
    { name: 'Восстановлено на склад', value: totals.restocked },
    { name: 'Списано/утилизировано', value: totals.writtenOff },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-toolbar">
        <button
          className="btn-secondary"
          onClick={() =>
            downloadFile(
              `${result.scenario.name || 'scenario'}-stats.csv`,
              String.fromCharCode(0xfeff) + buildStatsCsv(result),
              'text/csv;charset=utf-8',
            )
          }
        >
          ⬇ Экспорт CSV
        </button>
      </div>
      <div className="stat-cards">
        <Card label="Грузовиков приехало (прямой поток)" value={totals.trucksArrivedFwd} />
        <Card label="Машин/партий возврата приехало" value={totals.trucksArrivedRet} />
        <Card label="Отгружено грузовиками" value={totals.shippedTruck} sub="не локальная выдача + кросс-док" />
        <Card label="Маршрутных листов сформировано" value={totals.shippedCourier} />
        <Card label="Возвратов восстановлено" value={totals.restocked} />
        <Card label="Списано/утилизировано" value={totals.writtenOff} />
        <Card label="Модельное время прогона" value={`${result.endTime.toFixed(1)} ч`} />
      </div>

      <div className="dashboard-charts">
        <div className="chart-box">
          <div className="panel-title">Итоги по каналам отгрузки</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={outboundData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-box">
          <div className="panel-title-row">
            <span className="panel-title">Очередь во времени</span>
            <select value={stationId} onChange={(e) => setSelectedStation(e.target.value)}>
              {stationSummary.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="tLabel" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={30} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }} />
              <Line type="stepAfter" dataKey="queue" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <RunComparison />

      <div className="panel-title">Станции: загрузка и ожидание</div>
      <div className="station-table-wrap">
        <table className="station-table">
          <thead>
            <tr>
              <th>Станция</th>
              <th>Тип</th>
              <th>Загрузка</th>
              <th>Ср. ожидание</th>
              <th>Ср. обслуживание</th>
              <th>Циклов</th>
              <th>Макс. очередь</th>
              <th>Потери (заблокировано)</th>
            </tr>
          </thead>
          <tbody>
            {stationSummary.map((s) => (
              <tr key={s.id} className={s.id === stationId ? 'row-selected' : ''} onClick={() => setSelectedStation(s.id)}>
                <td>{s.name}</td>
                <td>{s.typeLabel}</td>
                <td>{s.utilizationPct.toFixed(0)}%</td>
                <td>{s.avgWaitMin.toFixed(1)} мин</td>
                <td>{s.avgServiceMin.toFixed(1)} мин</td>
                <td>{s.throughputCount}</td>
                <td>{s.maxQueue}</td>
                <td>{s.blocked || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.stats.eventCap && (
        <p className="warn-badge">Достигнут лимит событий движка — результат может быть неполным для этой длительности/интенсивности.</p>
      )}
    </div>
  );
}
