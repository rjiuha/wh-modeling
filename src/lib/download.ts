// src/lib/download.ts
// Общий помощник для скачивания сгенерированного на клиенте файла (JSON-сценарий, CSV-статистика).
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
