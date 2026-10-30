import { describe, expect, it, vi } from 'vitest';
import { VisualStateController } from '../src/visual-state';

describe('estados visuais', () => {
  it('notifica mudanças e não repete estados idênticos', () => {
    const controller = new VisualStateController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.set('processing');
    controller.set('processing');
    controller.set('responding');

    expect(controller.state).toBe('responding');
    expect(listener.mock.calls.map(([state]) => state)).toEqual(['idle', 'processing', 'responding']);
  });
});
