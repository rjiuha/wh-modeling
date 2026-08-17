// src/engine/rng.ts
// Детерминированный ГПСЧ (mulberry32) — фиксированный seed делает прогоны воспроизводимыми,
// что важно при подборе параметров конфигуратора.
import type { Distribution } from '../domain/types';

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng: Rng): number {
  // Box-Muller
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sample(dist: Distribution, rng: Rng): number {
  switch (dist.kind) {
    case 'const':
      return Math.max(0, dist.value);
    case 'uniform':
      return dist.min + rng() * (dist.max - dist.min);
    case 'exponential':
      return -Math.log(1 - rng()) * dist.mean;
    case 'normal':
      return Math.max(0, dist.mean + randNormal(rng) * dist.stdDev);
    case 'triangular': {
      const { min, mode, max } = dist;
      const f = (mode - min) / (max - min || 1);
      const u = rng();
      if (u < f) return min + Math.sqrt(u * (max - min) * (mode - min));
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
    default:
      return 0;
  }
}

export function distributionMean(dist: Distribution): number {
  switch (dist.kind) {
    case 'const':
      return dist.value;
    case 'uniform':
      return (dist.min + dist.max) / 2;
    case 'exponential':
      return dist.mean;
    case 'normal':
      return dist.mean;
    case 'triangular':
      return (dist.min + dist.mode + dist.max) / 3;
    default:
      return 0;
  }
}
