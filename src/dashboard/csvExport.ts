// src/dashboard/csvExport.ts
// Сборка CSV-выгрузки итогов прогона (сводные счётчики + таблица по станциям) для Excel/Sheets.
import type { SimResult } from '../engine/engine';
import { outboundTotals, summarizeStations } from './stats';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

export function buildStatsCsv(result: SimResult): string {
  const totals = outboundTotals(result);
  const stations = summarizeStations(result);
  let csv = '';

  csv += csvRow(['Сценарий', result.scenario.name]);
  csv += csvRow(['Модельное время прогона (ч)', result.endTime.toFixed(2)]);
  csv += '\r\n';

  csv += csvRow(['Сводные показатели', '']);
  csv += csvRow(['Грузовиков приехало (прямой поток)', totals.trucksArrivedFwd]);
  csv += csvRow(['Машин/партий возврата приехало', totals.trucksArrivedRet]);
  csv += csvRow(['Отгружено грузовиками', totals.shippedTruck]);
  csv += csvRow(['Маршрутных листов сформировано', totals.shippedCourier]);
  csv += csvRow(['Возвратов восстановлено', totals.restocked]);
  csv += csvRow(['Списано/утилизировано', totals.writtenOff]);
  csv += '\r\n';

  csv += csvRow(['Станция', 'Тип', 'Загрузка %', 'Ср. ожидание (мин)', 'Ср. обслуживание (мин)', 'Циклов', 'Макс. очередь', 'Потери']);
  for (const s of stations) {
    csv += csvRow([
      s.name,
      s.typeLabel,
      s.utilizationPct.toFixed(1),
      s.avgWaitMin.toFixed(1),
      s.avgServiceMin.toFixed(1),
      s.throughputCount,
      s.maxQueue,
      s.blocked,
    ]);
  }
  return csv;
}
