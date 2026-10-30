export interface StoredMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface MemoryEntry {
  id?: number;
  content: string;
  createdAt: number;
}

export interface AuraSettings {
  key: 'main';
  density: number;
  modelName: string;
  geminiApiKey: string;
  reducedMotion: boolean;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao acessar o armazenamento local.'));
  });
}

export class MemoryManager {
  private database?: IDBDatabase;

  async open(): Promise<void> {
    if (!('indexedDB' in globalThis)) throw new Error('Este navegador não oferece IndexedDB para persistir dados localmente.');
    const request = indexedDB.open('aura-local', 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('messages')) database.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
      if (!database.objectStoreNames.contains('memories')) database.createObjectStore('memories', { keyPath: 'id', autoIncrement: true });
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
    };
    this.database = await requestResult(request);
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  async messages(): Promise<StoredMessage[]> {
    return this.readAll<StoredMessage>('messages');
  }

  async addMessage(message: StoredMessage): Promise<void> {
    await this.write('messages', (store) => store.add(message));
  }

  async clearMessages(): Promise<void> {
    await this.write('messages', (store) => store.clear());
  }

  async saveMemory(content: string): Promise<void> {
    await this.write('memories', (store) => store.add({ content, createdAt: Date.now() } satisfies MemoryEntry));
  }

  async memories(): Promise<MemoryEntry[]> {
    return this.readAll<MemoryEntry>('memories');
  }

  async searchMemories(query: string): Promise<MemoryEntry[]> {
    const entries = await this.memories();
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return entries;
    const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 2);
    return entries.filter((entry) => terms.some((term) => normalizeText(entry.content).includes(term)));
  }

  async forgetMemory(id: number): Promise<void> {
    await this.write('memories', (store) => store.delete(id));
  }

  async settings(): Promise<AuraSettings> {
    const database = this.requireDatabase();
    const result = await requestResult(database.transaction('settings', 'readonly').objectStore('settings').get('main')) as Partial<AuraSettings> | undefined;
    return {
      key: 'main',
      density: typeof result?.density === 'number' ? result.density : 1200,
      modelName: typeof result?.modelName === 'string' && result.modelName.startsWith('gemini-')
        ? result.modelName
        : 'gemini-3.1-flash-lite',
      geminiApiKey: typeof result?.geminiApiKey === 'string' ? result.geminiApiKey : '',
      reducedMotion: result?.reducedMotion === true,
    };
  }

  async saveSettings(settings: AuraSettings): Promise<void> {
    await this.write('settings', (store) => store.put(settings));
  }

  private async readAll<T>(storeName: string): Promise<T[]> {
    const store = this.requireDatabase().transaction(storeName, 'readonly').objectStore(storeName);
    return requestResult(store.getAll()) as Promise<T[]>;
  }

  private async write(storeName: string, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    const transaction = this.requireDatabase().transaction(storeName, 'readwrite');
    operation(transaction.objectStore(storeName));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível salvar os dados locais.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('A operação local foi cancelada.'));
    });
  }

  private requireDatabase(): IDBDatabase {
    if (!this.database) throw new Error('O armazenamento local ainda não foi inicializado.');
    return this.database;
  }
}

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
