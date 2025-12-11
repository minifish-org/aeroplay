type StepFn = (dt: number) => void;

export class GameLoop {
  private running = false;
  private last = 0;
  private rafId = 0;

  constructor(private readonly step: StepFn, private readonly maxDt = 0.05) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (time: number) => {
    if (!this.running) return;
    const rawDt = (time - this.last) / 1000;
    const dt = Math.min(this.maxDt, rawDt);
    this.last = time;
    this.step(dt);
    this.rafId = requestAnimationFrame(this.tick);
  };
}

export function runInterval(stepMs: number, step: StepFn) {
  let last = performance.now();
  const id = requestAnimationFrame(function loop(time) {
    if (time - last >= stepMs) {
      const dt = (time - last) / 1000;
      last = time;
      step(dt);
    }
    requestAnimationFrame(loop);
  });
  return () => cancelAnimationFrame(id);
}
