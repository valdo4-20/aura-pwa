import { AIController, ToolRegistry, validateShapeToolArgument } from './assistant';
import { shapeLabel, type ShapeName } from './geometry';
import { MemoryManager, type AuraSettings, type StoredMessage } from './memory';
import { GeminiAdapter, type ModelAdapter } from './gemini';
import { AsciiRenderer } from './renderer';
import { VisualStateController, type VisualState } from './visual-state';
import './style.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento obrigatório não encontrado: #${id}`);
  return element as T;
};

const canvas = byId<HTMLCanvasElement>('visual-canvas');
const messagesElement = byId<HTMLDivElement>('messages');
const form = byId<HTMLFormElement>('chat-form');
const input = byId<HTMLInputElement>('message-input');
const notice = byId<HTMLDivElement>('notice');
const pointerState = { active: false, lastX: 0, lastY: 0, pinchDistance: 0, multiTouch: false };
const memory = new MemoryManager();
const visualState = new VisualStateController();
const renderer = new AsciiRenderer(canvas);
const tools = new ToolRegistry();
let currentShape: ShapeName = 'sphere';
let settings: AuraSettings = {
  key: 'main',
  density: 1200,
  modelName: 'gemini-3.1-flash-lite',
  geminiApiKey: '',
  reducedMotion: false,
};
let adapter: ModelAdapter | undefined;
let controller = new AIController(memory, undefined, tools);
let busy = false;
let noticeTimer = 0;
let installPrompt: InstallPromptEvent | undefined;

const stateCopy: Record<VisualState, string> = {
  idle: 'EM REPOUSO',
  listening: 'ESCUTANDO',
  processing: 'PROCESSANDO',
  responding: 'RESPONDENDO',
  visualizing: 'VISUALIZANDO',
  memory: 'MEMÓRIA',
  error: 'ERRO',
};

visualState.subscribe((state) => {
  renderer.setState(state);
  byId<HTMLSpanElement>('visual-label').textContent = `${shapeLabel(currentShape)} · ${stateCopy[state]}`;
});

tools.register('show_shape', async (args) => {
  const shape = validateShapeToolArgument(args);
  renderer.morphTo(shape);
  currentShape = shape;
  return `Visualizando ${shapeLabel(shape).toLocaleLowerCase('pt-BR')}.`;
});
tools.register('return_to_sphere', async () => {
  renderer.morphTo('sphere');
  currentShape = 'sphere';
  return 'Voltei à distribuição esférica original.';
});
tools.register('change_density', async (args) => {
  if (typeof args !== 'object' || args === null || !('density' in args) || typeof args.density !== 'number' || !Number.isInteger(args.density) || args.density < 400 || args.density > 2400) {
    throw new TypeError('A densidade deve ser um inteiro entre 400 e 2400.');
  }
  renderer.setDensity(args.density);
  settings.density = args.density;
  byId<HTMLInputElement>('density-input').value = String(args.density);
  byId<HTMLSpanElement>('density-value').textContent = args.density.toLocaleString('pt-BR');
  return 'Densidade atualizada.';
});
tools.register('rotate_visualization', async (args) => {
  if (typeof args !== 'object' || args === null || !('axis' in args) || !('degrees' in args)
    || !['x', 'y', 'z'].includes(String(args.axis)) || typeof args.degrees !== 'number'
    || !Number.isFinite(args.degrees) || Math.abs(args.degrees) > 180) {
    throw new TypeError('Informe um eixo x, y ou z e um ângulo entre -180 e 180 graus.');
  }
  renderer.rotateBy(args.axis as 'x' | 'y' | 'z', args.degrees * Math.PI / 180);
  return 'Rotação aplicada.';
});
tools.register('explain_visualization', async (args) => {
  const shape = validateShapeToolArgument(args);
  const descriptions: Record<ShapeName, string> = {
    sphere: 'A esfera distribui os caracteres pela superfície de uma forma redonda e contínua.',
    cube: 'O cubo organiza os caracteres em seis faces planas e arestas ortogonais.',
    pyramid: 'A pirâmide combina uma base quadrada com quatro faces triangulares que convergem no topo.',
    cylinder: 'O cilindro possui uma superfície lateral curva e duas bases circulares.',
    torus: 'O toro é uma superfície em forma de anel.',
    cup: 'A xícara é representada por uma parede cilíndrica aberta, base e alça curva.',
    tree: 'A árvore é uma composição procedural de copa em camadas e tronco.',
    planet: 'O planeta combina uma esfera central com uma faixa orbital ao redor.',
    'solar-system': 'O sistema solar apresenta um corpo central, órbitas e pequenos planetas orbitando.',
    atom: 'O átomo representa um núcleo e órbitas esquemáticas; não está em escala e não é um modelo físico detalhado.',
    network: 'A rede organiza pontos em uma estrutura abstrata de conexões.',
  };
  return descriptions[shape];
});
tools.register('save_memory', async (args) => {
  if (typeof args !== 'object' || args === null || !('content' in args) || typeof args.content !== 'string' || !args.content.trim()) {
    throw new TypeError('Informe o conteúdo que deve ser salvo na memória.');
  }
  await memory.saveMemory(args.content.trim());
  return 'Memória salva.';
});
tools.register('search_memory', async (args) => {
  if (typeof args !== 'object' || args === null || !('query' in args) || typeof args.query !== 'string') {
    throw new TypeError('Informe uma consulta de memória válida.');
  }
  return memory.searchMemories(args.query);
});
tools.register('forget_memory', async (args) => {
  if (typeof args !== 'object' || args === null || !('id' in args) || typeof args.id !== 'number' || !Number.isInteger(args.id)
    || !('confirmed' in args) || args.confirmed !== true) {
    throw new TypeError('A exclusão exige um identificador e confirmação explícita.');
  }
  await memory.forgetMemory(args.id);
  return 'Memória apagada.';
});
tools.register('get_system_status', async () => `Modo ${adapter ? `Gemini (${settings.modelName})` : 'offline'} · ${settings.density.toLocaleString('pt-BR')} caracteres · estado ${visualState.state}.`);

function showNotice(message: string, timeout = 5000): void {
  notice.textContent = message;
  notice.classList.add('visible');
  window.clearTimeout(noticeTimer);
  if (timeout > 0) noticeTimer = window.setTimeout(() => notice.classList.remove('visible'), timeout);
}

function renderMessage(message: StoredMessage): void {
  const bubble = document.createElement('article');
  bubble.className = `message ${message.role}`;
  const role = document.createElement('span');
  role.className = 'message-role';
  role.textContent = message.role === 'user' ? 'VOCÊ' : 'AURA';
  const content = document.createElement('p');
  content.textContent = message.content;
  bubble.append(role, content);
  messagesElement.append(bubble);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

async function saveMessage(role: StoredMessage['role'], content: string): Promise<void> {
  const message: StoredMessage = { role, content, timestamp: Date.now() };
  renderMessage(message);
  await memory.addMessage(message);
}

async function sendMessage(message: string): Promise<void> {
  if (busy) return;
  const text = message.trim();
  if (!text) return;
  busy = true;
  byId<HTMLButtonElement>('send-button').disabled = true;
  input.disabled = true;
  try {
    await saveMessage('user', text);
    visualState.set('processing');
    const result = await controller.respond(text);
    if (result.shape) {
      await tools.execute(result.shape === 'sphere' ? 'return_to_sphere' : 'show_shape', result.shape === 'sphere' ? null : { shape: result.shape });
      currentShape = result.shape;
    }
    if (result.rotation) {
      await tools.execute('rotate_visualization', { axis: result.rotation.axis, degrees: result.rotation.direction * 28 });
    }
    visualState.set(result.state);
    await saveMessage('assistant', result.reply);
    if (result.state === 'responding' || result.state === 'memory') window.setTimeout(() => visualState.set('idle'), 1400);
  } catch (error) {
    visualState.set('error');
    const messageText = error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
    showNotice(messageText, 8000);
    const failureReply = `Não consegui concluir essa ação: ${messageText}`;
    try {
      await saveMessage('assistant', failureReply);
    } catch (storageError) {
      renderMessage({ role: 'assistant', content: failureReply, timestamp: Date.now() });
      showNotice(storageError instanceof Error ? `A resposta não foi persistida: ${storageError.message}` : 'A resposta não foi persistida no armazenamento local.', 8000);
    }
    window.setTimeout(() => visualState.set('idle'), 1800);
  } finally {
    busy = false;
    byId<HTMLButtonElement>('send-button').disabled = false;
    input.disabled = false;
    if (window.matchMedia('(min-width: 641px)').matches) input.focus();
  }
}

async function renderMemories(): Promise<void> {
  const list = byId<HTMLDivElement>('memory-list');
  list.replaceChildren();
  const entries = await memory.memories();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-memory';
    empty.textContent = 'Nenhuma memória salva.';
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    if (entry.id === undefined) continue;
    const row = document.createElement('article');
    row.className = 'memory-entry';
    const text = document.createElement('p');
    text.textContent = entry.content;
    const date = document.createElement('time');
    date.dateTime = new Date(entry.createdAt).toISOString();
    date.textContent = new Date(entry.createdAt).toLocaleDateString('pt-BR');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button delete-memory';
    remove.textContent = 'Apagar';
    remove.addEventListener('click', async () => {
      if (!window.confirm('Apagar esta informação da memória local? Esta ação não pode ser desfeita.')) return;
      try {
        await tools.execute('forget_memory', { id: entry.id, confirmed: true });
        await renderMemories();
        showNotice('Memória apagada.');
      } catch (error) {
        showNotice(error instanceof Error ? error.message : 'Não foi possível apagar a memória.', 8000);
      }
    });
    row.append(text, date, remove);
    list.append(row);
  }
}

async function selectAdapter(): Promise<void> {
  adapter = settings.geminiApiKey ? new GeminiAdapter(settings.geminiApiKey, settings.modelName) : undefined;
  controller = new AIController(memory, adapter, tools);
  byId<HTMLSpanElement>('mode-label').textContent = adapter ? `Gemini · ${settings.modelName}` : 'Modo offline';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value;
  input.value = '';
  void sendMessage(text);
});

byId<HTMLButtonElement>('settings-toggle').addEventListener('click', () => {
  byId<HTMLElement>('settings-panel').hidden = false;
  void renderMemories().catch((error: unknown) => showNotice(error instanceof Error ? error.message : 'Não foi possível carregar a memória.', 8000));
});

document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.close;
    if (target) byId<HTMLElement>(target).hidden = true;
  });
});

byId<HTMLInputElement>('density-input').addEventListener('input', (event) => {
  const density = Number((event.currentTarget as HTMLInputElement).value);
  void tools.execute('change_density', { density }).catch((error: unknown) => showNotice(error instanceof Error ? error.message : 'Falha ao ajustar densidade.'));
});

byId<HTMLButtonElement>('save-settings').addEventListener('click', async () => {
  settings.geminiApiKey = byId<HTMLInputElement>('gemini-api-key').value.trim();
  settings.modelName = byId<HTMLInputElement>('gemini-model').value.trim() || 'gemini-3.1-flash-lite';
  settings.reducedMotion = byId<HTMLInputElement>('reduced-motion').checked;
  settings.density = Number(byId<HTMLInputElement>('density-input').value);
  try {
    await memory.saveSettings(settings);
    await selectAdapter();
    renderer.setReducedMotion(settings.reducedMotion);
    showNotice(adapter ? 'Configurações salvas. Gemini responderá às perguntas abertas.' : 'Configurações salvas. A aplicação continuará em modo offline.');
    byId<HTMLElement>('settings-panel').hidden = true;
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.', 8000);
  }
});

byId<HTMLInputElement>('reduced-motion').addEventListener('change', (event) => {
  const enabled = (event.currentTarget as HTMLInputElement).checked;
  renderer.setReducedMotion(enabled);
});

byId<HTMLInputElement>('pause-animation').addEventListener('change', (event) => {
  const paused = (event.currentTarget as HTMLInputElement).checked;
  renderer.pause(paused);
});

byId<HTMLButtonElement>('install-app').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') byId<HTMLButtonElement>('install-app').hidden = true;
  installPrompt = undefined;
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  byId<HTMLButtonElement>('install-app').hidden = false;
});

window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  byId<HTMLButtonElement>('install-app').hidden = true;
  showNotice('AURA foi instalada neste dispositivo.');
});

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  try {
    await navigator.serviceWorker.register(new URL('sw.js', document.baseURI));
  } catch (error) {
    showNotice(error instanceof Error ? `Instalação offline indisponível: ${error.message}` : 'Não foi possível habilitar o modo offline.');
  }
}

byId<HTMLButtonElement>('clear-chat').addEventListener('click', async () => {
  if (!window.confirm('Apagar todo o histórico desta conversa armazenado neste navegador?')) return;
  try {
    await tools.execute('clear_conversation', null);
    messagesElement.replaceChildren();
    showNotice('Conversa apagada deste navegador.');
  } catch (error) {
    showNotice(error instanceof Error ? error.message : 'Não foi possível apagar a conversa.', 8000);
  }
});

tools.register('clear_conversation', async () => {
  await memory.clearMessages();
  return 'Histórico da conversa removido.';
});

canvas.addEventListener('renderer-error', (event) => {
  const detail = (event as CustomEvent<string>).detail;
  visualState.set('error');
  showNotice(detail, 8000);
});

canvas.addEventListener('density-change', (event) => {
  const detail = (event as CustomEvent<number>).detail;
  byId<HTMLSpanElement>('density-value').textContent = detail.toLocaleString('pt-BR');
});

canvas.addEventListener('pointerdown', (event) => {
  pointerState.active = true;
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
  renderer.handlePointerDown(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (!pointerState.active || pointerState.multiTouch) return;
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  renderer.handlePointerMove(event);
});
canvas.addEventListener('pointerup', (event) => {
  pointerState.active = false;
  renderer.handlePointerUp(event);
});
canvas.addEventListener('pointerleave', () => {
  pointerState.active = false;
});
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  renderer.handleWheel(event);
}, { passive: false });
canvas.addEventListener('touchstart', (event) => {
  if (event.touches.length === 2) {
    pointerState.multiTouch = true;
    pointerState.pinchDistance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY,
    );
    renderer.beginTouchZoom(pointerState.pinchDistance);
  }
}, { passive: true });
canvas.addEventListener('touchmove', (event) => {
  if (event.touches.length === 2 && pointerState.pinchDistance > 0) {
    const nextDistance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY,
    );
    renderer.handleTouchZoom(nextDistance);
    pointerState.pinchDistance = nextDistance;
    event.preventDefault();
  }
}, { passive: false });
canvas.addEventListener('touchend', (event) => {
  if (event.touches.length < 2) {
    pointerState.multiTouch = false;
    pointerState.pinchDistance = 0;
    renderer.endTouchZoom();
  }
}, { passive: true });
window.addEventListener('beforeunload', () => renderer.dispose(), { once: true });

async function initialize(): Promise<void> {
  try {
    await memory.open();
    settings = { ...settings, ...await memory.settings() };
    await selectAdapter();
    renderer.setDensity(settings.density);
    byId<HTMLInputElement>('density-input').value = String(settings.density);
    byId<HTMLSpanElement>('density-value').textContent = settings.density.toLocaleString('pt-BR');
    byId<HTMLInputElement>('gemini-model').value = settings.modelName;
    byId<HTMLInputElement>('gemini-api-key').value = settings.geminiApiKey;
    const reducedMotion = settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    byId<HTMLInputElement>('reduced-motion').checked = reducedMotion;
    byId<HTMLInputElement>('pause-animation').checked = false;
    renderer.setReducedMotion(reducedMotion);
    const history = await memory.messages();
    for (const message of history.slice(-80)) renderMessage(message);
    if (history.length === 0) await saveMessage('assistant', 'Olá. Sou AURA, uma interface visual experimental. Posso transformar meus caracteres em formas, guardar algo que você pedir explicitamente ou responder perguntas com a Gemini, depois de você configurar uma chave.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível inicializar o armazenamento local.';
    showNotice(message, 0);
    renderMessage({ role: 'assistant', content: 'A visualização continua ativa, mas a memória persistente não está disponível neste navegador.', timestamp: Date.now() });
  }
}

void initialize();
void registerServiceWorker();
input.addEventListener('focus', () => visualState.set('listening'));
input.addEventListener('blur', () => {
  if (!busy) visualState.set('idle');
});
