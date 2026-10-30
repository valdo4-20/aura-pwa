export interface ModelAdapter {
  complete(prompt: string, signal?: AbortSignal): Promise<string>;
}

function abortableRequest(signal?: AbortSignal): { controller: AbortController; timeout: number; onAbort: () => void } {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(new Error('Tempo limite ao aguardar o Gemini.')), 45_000);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  return { controller, timeout, onAbort };
}

function finishRequest(timeout: number, signal: AbortSignal | undefined, onAbort: () => void): void {
  globalThis.clearTimeout(timeout);
  signal?.removeEventListener('abort', onAbort);
}

export class GeminiAdapter implements ModelAdapter {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    if (!this.apiKey.trim()) throw new Error('Informe sua chave da Gemini API nas configurações.');
    if (!this.model.trim()) throw new Error('Informe o modelo Gemini que deseja usar.');
    const request = abortableRequest(signal);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: 'Você é AURA, um assistente experimental com interface visual ASCII 3D. Responda em português com clareza. Você não é consciente. Não alegue executar transformações visuais nem salvar memórias; os comandos são tratados separadamente pelo aplicativo.',
              }],
            },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 700, temperature: 0.7 },
          }),
          signal: request.controller.signal,
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('A Gemini API recusou a chave. Verifique a chave e as permissões no Google AI Studio.');
        }
        if (response.status === 429) {
          throw new Error('A cota gratuita da Gemini API foi atingida. Aguarde a renovação ou confira os limites do projeto.');
        }
        throw new Error(`Gemini API respondeu com HTTP ${response.status}.`);
      }

      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null || !('candidates' in payload) || !Array.isArray(payload.candidates)) {
        throw new Error('A Gemini API retornou uma resposta em formato inesperado.');
      }
      const candidate = payload.candidates[0];
      if (typeof candidate !== 'object' || candidate === null || !('content' in candidate)
        || typeof candidate.content !== 'object' || candidate.content === null
        || !('parts' in candidate.content) || !Array.isArray(candidate.content.parts)) {
        throw new Error('A Gemini API não retornou texto. A resposta pode ter sido bloqueada por segurança.');
      }
      const text = candidate.content.parts
        .filter((part: unknown): part is { text: string } =>
          typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string')
        .map((part: { text: string }) => part.text)
        .join('')
        .trim();
      if (!text) throw new Error('A Gemini API retornou uma resposta vazia.');
      return text;
    } finally {
      finishRequest(request.timeout, signal, request.onAbort);
    }
  }
}
