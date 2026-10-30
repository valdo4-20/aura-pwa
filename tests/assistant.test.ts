import { describe, expect, it, vi } from 'vitest';
import { AIController, interpretIntent, ToolRegistry, validateShapeToolArgument } from '../src/assistant';
import type { MemoryManager } from '../src/memory';

describe('interpretação offline', () => {
  it('reconhece comandos em português com e sem acentuação', () => {
    expect(interpretIntent('Mostre um cubo')).toEqual({ type: 'shape', shape: 'cube' });
    expect(interpretIntent('Transforme em uma xícara')).toEqual({ type: 'shape', shape: 'cup' });
    expect(interpretIntent('volte à forma original')).toEqual({ type: 'shape', shape: 'sphere' });
    expect(interpretIntent('Lembre que estou desenvolvendo um jogo')).toMatchObject({ type: 'save-memory', content: 'estou desenvolvendo um jogo' });
  });

  it('não inventa capacidades de modelo quando está offline', async () => {
    const memory = { saveMemory: vi.fn() } as unknown as MemoryManager;
    const result = await new AIController(memory).respond('Explique a relatividade');
    expect(result.reply).toContain('chave Gemini');
  });

  it('valida argumentos de ferramentas e recusa ferramentas desconhecidas', async () => {
    expect(validateShapeToolArgument({ shape: 'planet' })).toBe('planet');
    expect(() => validateShapeToolArgument({ shape: 'unknown' })).toThrow(TypeError);
    const tools = new ToolRegistry();
    await expect(tools.execute('exec_shell', {})).rejects.toThrow('não autorizada');
  });
});
