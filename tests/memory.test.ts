import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryManager } from '../src/memory';

const managers: MemoryManager[] = [];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe('persistência local', () => {
  afterEach(() => {
    for (const manager of managers.splice(0)) manager.close();
  });
  beforeEach(async () => deleteDatabase('aura-local'));

  it('salva e recupera conversas, memórias e configurações no IndexedDB', async () => {
    const memory = new MemoryManager();
    managers.push(memory);
    await memory.open();
    await memory.addMessage({ role: 'user', content: 'Olá', timestamp: 1 });
    await memory.saveMemory('Estou criando um jogo');
    await memory.saveSettings({
      key: 'main',
      density: 1600,
      modelName: 'gemini-3.1-flash-lite',
      geminiApiKey: '',
      reducedMotion: true,
    });

    expect(await memory.messages()).toMatchObject([{ role: 'user', content: 'Olá' }]);
    expect(await memory.searchMemories('jogo')).toMatchObject([{ content: 'Estou criando um jogo' }]);
    expect(await memory.settings()).toMatchObject({ density: 1600, reducedMotion: true });
  });

  it('migra as configurações antigas sem reativar o provedor removido', async () => {
    const memory = new MemoryManager();
    managers.push(memory);
    await memory.open();
    await memory.saveSettings({
      key: 'main',
      density: 900,
      modelName: 'legacy-local-model',
      geminiApiKey: '',
      reducedMotion: false,
    });

    expect(await memory.settings()).toMatchObject({
      density: 900,
      modelName: 'gemini-3.1-flash-lite',
      geminiApiKey: '',
    });
  });

  it('remove uma memória e limpa somente o histórico da conversa', async () => {
    const memory = new MemoryManager();
    managers.push(memory);
    await memory.open();
    await memory.addMessage({ role: 'assistant', content: 'Resposta', timestamp: 1 });
    await memory.saveMemory('Preferência salva');
    const [entry] = await memory.memories();
    await memory.forgetMemory(entry.id as number);
    await memory.clearMessages();

    expect(await memory.memories()).toEqual([]);
    expect(await memory.messages()).toEqual([]);
  });
});
