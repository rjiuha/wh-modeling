// src/simview/PlaybackControls.tsx
// Управление воспроизведением уже посчитанной симуляции: play/pause, скорость, перемотка.
import { useSimStore } from '../store/simStore';

function formatHours(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}ч ${String(mm).padStart(2, '0')}м`;
}

const SPEEDS = [1, 5, 20, 60, 200];

export function PlaybackControls() {
  const result = useSimStore((s) => s.result);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const virtualTime = useSimStore((s) => s.virtualTime);
  const play = useSimStore((s) => s.play);
  const pause = useSimStore((s) => s.pause);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setVirtualTime = useSimStore((s) => s.setVirtualTime);

  if (!result) return null;
  const end = result.endTime;

  return (
    <div className="playback-bar">
      <button className="btn-secondary" onClick={() => (playing ? pause() : play())}>
        {playing ? '⏸ Пауза' : '▶ Играть'}
      </button>
      <span className="playback-time">
        {formatHours(virtualTime)} / {formatHours(end)}
      </span>
      <input
        className="playback-slider"
        type="range"
        min={0}
        max={end}
        step={end / 1000 || 0.01}
        value={virtualTime}
        onChange={(e) => setVirtualTime(parseFloat(e.target.value))}
      />
      <div className="speed-group">
        {SPEEDS.map((s) => (
          <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>
            ×{s}
          </button>
        ))}
      </div>
      {result.stats.eventCap && <span className="warn-badge">лимит событий достигнут — сим мог быть неполным</span>}
    </div>
  );
}
