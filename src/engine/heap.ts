// src/engine/heap.ts
// Простая бинарная min-heap очередь событий по времени — ядро дискретно-событийного движка.
export interface HeapItem<T> {
  time: number;
  seq: number; // тай-брейк для стабильного порядка при равном времени (FIFO)
  payload: T;
}

export class EventHeap<T> {
  private items: HeapItem<T>[] = [];
  private seqCounter = 0;

  get size(): number {
    return this.items.length;
  }

  push(time: number, payload: T): void {
    const item: HeapItem<T> = { time, seq: this.seqCounter++, payload };
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem<T> | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private less(a: HeapItem<T>, b: HeapItem<T>): boolean {
    return a.time !== b.time ? a.time < b.time : a.seq < b.seq;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(this.items[i], this.items[parent])) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else break;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.items.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let smallest = i;
      if (l < n && this.less(this.items[l], this.items[smallest])) smallest = l;
      if (r < n && this.less(this.items[r], this.items[smallest])) smallest = r;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}
