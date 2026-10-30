import { describe, expect, it, vi } from 'vitest';
import { GeminiAdapter } from '../src/gemini';

describe('Gemini adapter', () => {
  it('envia a chave em header e extrai o texto da resposta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Olá! ' }, { text: 'Como posso ajudar?' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GeminiAdapter('chave-de-teste', 'gemini-3.1-flash-lite');

    await expect(adapter.complete('Olá')).resolves.toBe('Olá! Como posso ajudar?');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.1-flash-lite:generateContent');
    expect(new Headers(options.headers).get('x-goog-api-key')).toBe('chave-de-teste');
    expect(options.body).toContain('Olá');
    vi.unstubAllGlobals();
  });

  it('converte limite de cota em erro compreensível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    const adapter = new GeminiAdapter('chave-de-teste', 'gemini-3.1-flash-lite');
    await expect(adapter.complete('Olá')).rejects.toThrow('cota gratuita');
    vi.unstubAllGlobals();
  });

  it('não envia requisição sem chave configurada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GeminiAdapter('', 'gemini-3.1-flash-lite');
    await expect(adapter.complete('Olá')).rejects.toThrow('Informe sua chave');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('propaga cancelamento para a Gemini API', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new GeminiAdapter('chave-de-teste', 'gemini-3.1-flash-lite');
    const cancellation = new AbortController();
    const pending = adapter.complete('Olá', cancellation.signal);
    cancellation.abort(new Error('Cancelado pelo usuário'));
    await expect(pending).rejects.toThrow('Cancelado pelo usuário');
    vi.unstubAllGlobals();
  });
});
