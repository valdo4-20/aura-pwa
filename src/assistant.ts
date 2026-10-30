import { isShapeName, shapeLabel, type ShapeName } from './geometry';
import { normalizeText, type MemoryManager } from './memory';
import type { ModelAdapter } from './gemini';

export type Intent =
  | { type: 'shape'; shape: ShapeName }
  | { type: 'explain'; shape: ShapeName }
  | { type: 'rotate'; direction: -1 | 1 }
  | { type: 'save-memory'; content: string }
  | { type: 'search-memory'; query: string }
  | { type: 'forget-memory'; id?: number }
  | { type: 'clear-conversation' }
  | { type: 'status' }
  | { type: 'help' }
  | { type: 'chat' };

export interface AssistantResult {
  reply: string;
  shape?: ShapeName;
  rotation?: { axis: 'y'; direction: -1 | 1 };
  state: 'responding' | 'visualizing' | 'memory' | 'processing';
}

export function interpretIntent(message: string): Intent {
  const text = normalizeText(message);
  const explanationRequest = /\b(explique|explicar|o que e|sobre)\b/.test(text);
  const requestedShape = getShape(text, explanationRequest);
  if (requestedShape && explanationRequest) return { type: 'explain', shape: requestedShape };
  if (requestedShape) return { type: 'shape', shape: requestedShape };
  if (/\b(gire|girar|rotacione|rotacionar|rode)\b/.test(text)) return { type: 'rotate', direction: /\b(esquerda|anti.?horario)\b/.test(text) ? -1 : 1 };
  if (/\b(ajuda|o que voce consegue|o que voce pode|capacidades|comandos)\b/.test(text)) return { type: 'help' };
  if (/\b(status|como voce esta|estado do sistema)\b/.test(text)) return { type: 'status' };
  if (/\b(limpar|apagar|limpe)\b.*\b(conversa|historico|chat)\b/.test(text)) return { type: 'clear-conversation' };
  if (/\b(esqueca|esquecer|apague|remova)\b.*\b(memoria|lembrete|informacao)\b/.test(text)) return { type: 'forget-memory' };
  const saveMatch = message.match(/^(?:lembre(?:-se)?|memorize|guarde|salve)(?:\s+que)?\s+(.+)$/i);
  if (saveMatch) return { type: 'save-memory', content: saveMatch[1].trim() };
  if (/\b(o que eu te contei|o que voce lembra|consulte a memoria|minhas memorias|minha memoria)\b/.test(text)) {
    return { type: 'search-memory', query: message };
  }
  return { type: 'chat' };
}

function getShape(text: string, allowMention = false): ShapeName | undefined {
  const returning = /\b(volte|retorne|voltar|retornar)\b/.test(text) && /\b(esfera|original|forma original)\b/.test(text);
  if (returning) return 'sphere';
  const cues: Array<[RegExp, ShapeName]> = [
    [/\b(sistema solar|orbitas|planetas)\b/, 'solar-system'],
    [/\b(atomo|molecula)\b/, 'atom'],
    [/\b(rede|conexoes|agrupamentos)\b/, 'network'],
    [/\b(planeta|terra|mundo)\b/, 'planet'],
    [/\b(xicara|caneca)\b/, 'cup'],
    [/\b(arvore|pinheiro)\b/, 'tree'],
    [/\b(piramide)\b/, 'pyramid'],
    [/\b(cilindro)\b/, 'cylinder'],
    [/\b(toro|donut)\b/, 'torus'],
    [/\b(cubo)\b/, 'cube'],
    [/\b(esfera)\b/, 'sphere'],
  ];
  for (const [pattern, shape] of cues) {
    if (pattern.test(text) && (allowMention || /\b(mostre|mostrar|transforme|transformar|visualize|desenhe|faca|crie|forma|em)\b/.test(text) || shape === 'sphere')) return shape;
  }
  return undefined;
}

export class ToolRegistry {
  private readonly tools = new Map<string, (args: unknown) => Promise<unknown>>();

  register(name: string, handler: (args: unknown) => Promise<unknown>): void {
    if (!/^[a-z_]+$/.test(name)) throw new TypeError('O nome da ferramenta é inválido.');
    this.tools.set(name, handler);
  }

  execute(name: string, args: unknown): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) return Promise.reject(new Error(`Ferramenta não autorizada: ${name}`));
    return handler(args);
  }
}

export class AIController {
  constructor(private readonly memory: MemoryManager, private readonly model?: ModelAdapter, private readonly tools?: ToolRegistry) {}

  async respond(message: string, signal?: AbortSignal): Promise<AssistantResult> {
    const intent = interpretIntent(message);
    switch (intent.type) {
      case 'shape':
        return { reply: `Visualizando ${shapeLabel(intent.shape).toLocaleLowerCase('pt-BR')}. Você pode pedir outra forma ou voltar à esfera.`, shape: intent.shape, state: 'visualizing' };
      case 'explain': {
        const explanation = await this.tools?.execute('explain_visualization', { shape: intent.shape });
        return { reply: typeof explanation === 'string' ? explanation : explainShape(intent.shape), state: 'responding' };
      }
      case 'rotate':
        return { reply: 'Rotacionando a visualização.', rotation: { axis: 'y', direction: intent.direction }, state: 'visualizing' };
      case 'save-memory':
        if (!intent.content) return { reply: 'Diga o que você quer que eu guarde. Por exemplo: “Lembre que estou desenvolvendo um jogo”.', state: 'responding' };
        if (this.tools) await this.tools.execute('save_memory', { content: intent.content });
        else await this.memory.saveMemory(intent.content);
        return { reply: `Anotei na memória local: “${intent.content}”. Você pode consultar ou apagar essa informação quando quiser.`, state: 'memory' };
      case 'search-memory': {
        const result = this.tools ? await this.tools.execute('search_memory', { query: '' }) : await this.memory.searchMemories('');
        if (!Array.isArray(result)) throw new TypeError('A ferramenta de memória retornou um resultado inválido.');
        const memories = result.filter((entry): entry is { content: string } => typeof entry === 'object' && entry !== null && 'content' in entry && typeof entry.content === 'string');
        return {
          reply: memories.length ? `Encontrei ${memories.length} ${memories.length === 1 ? 'informação salva' : 'informações salvas'}:\n${memories.map((entry) => `• ${entry.content}`).join('\n')}` : 'Ainda não há informações salvas na memória local.',
          state: 'memory',
        };
      }
      case 'forget-memory':
        return { reply: 'Abra o painel de memória e escolha a informação que deseja apagar. A remoção exige confirmação.', state: 'memory' };
      case 'clear-conversation':
        return { reply: 'Use “Limpar conversa” abaixo para apagar o histórico deste navegador. O aplicativo pedirá confirmação.', state: 'responding' };
      case 'status': {
        const status = await this.tools?.execute('get_system_status', null);
        return { reply: typeof status === 'string' ? status : `Estou funcionando em modo ${this.model ? 'conectado a um modelo local' : 'offline'}. A visualização ASCII e os comandos básicos estão disponíveis.`, state: 'responding' };
      }
      case 'help':
        return { reply: 'Posso transformar os caracteres em esfera, cubo, pirâmide, cilindro, toro, xícara, árvore, planeta, sistema solar, átomo ou rede. Também posso guardar algo que você pedir explicitamente com “Lembre que…”, consultar a memória local e explicar meu estado. Para conversas abertas, configure sua chave Gemini nas configurações.', state: 'responding' };
      case 'chat':
        if (this.model) {
          const history = await this.memory.messages();
          const recent = history.filter((entry) => !(entry.role === 'user' && entry.content === message)).slice(-10);
          const context = recent.map((entry) => `${entry.role === 'user' ? 'Usuário' : 'AURA'}: ${entry.content}`).join('\n');
          const memories = await this.memory.searchMemories(message);
          const memoryContext = memories.length ? `\nMemórias locais relevantes, salvas explicitamente pelo usuário:\n${memories.map((entry) => `- ${entry.content}`).join('\n')}` : '';
          const prompt = `${context ? `Contexto recente da conversa:\n${context}\n\n` : ''}${message}${memoryContext}`;
          return { reply: await this.model.complete(prompt, signal), state: 'responding' };
        }
        return { reply: 'Ainda não há uma chave Gemini configurada, então não consigo responder perguntas abertas. Posso mostrar formas, guardar informações que você pedir explicitamente, consultar a memória local ou explicar meus recursos. Adicione a chave nas configurações para conversar com a IA.', state: 'responding' };
    }
  }
}

function explainShape(shape: ShapeName): string {
  const explanations: Record<ShapeName, string> = {
    sphere: 'A esfera distribui os caracteres pela superfície de uma forma redonda e contínua.',
    cube: 'O cubo organiza os caracteres em seis faces planas e arestas ortogonais.',
    pyramid: 'A pirâmide combina uma base quadrada com quatro faces triangulares que convergem no topo.',
    cylinder: 'O cilindro possui uma superfície lateral curva e duas bases circulares.',
    torus: 'O toro é uma superfície em forma de anel, gerada pela rotação de um círculo em torno de um eixo.',
    cup: 'A xícara é representada por uma parede cilíndrica aberta, base e alça curva.',
    tree: 'A árvore é uma composição procedural de copa em camadas e tronco.',
    planet: 'O planeta combina uma esfera central com uma faixa orbital ao redor.',
    'solar-system': 'O sistema solar apresenta um corpo central, órbitas e pequenos planetas orbitando.',
    atom: 'O átomo representa um núcleo e órbitas esquemáticas; não está em escala e não é um modelo físico detalhado.',
    network: 'A rede organiza pontos em uma estrutura abstrata de conexões.',
  };
  return explanations[shape];
}

export function validateShapeToolArgument(args: unknown): ShapeName {
  if (typeof args !== 'object' || args === null || !('shape' in args) || typeof args.shape !== 'string' || !isShapeName(args.shape)) {
    throw new TypeError('Argumento inválido para show_shape: informe uma forma conhecida.');
  }
  return args.shape;
}
