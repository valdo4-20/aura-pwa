export type VisualState = 'idle' | 'listening' | 'processing' | 'responding' | 'visualizing' | 'memory' | 'error';

export class VisualStateController {
  private current: VisualState = 'idle';
  private readonly listeners = new Set<(state: VisualState) => void>();

  get state(): VisualState {
    return this.current;
  }

  set(state: VisualState): void {
    if (state === this.current) return;
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  subscribe(listener: (state: VisualState) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}
