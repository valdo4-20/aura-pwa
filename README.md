# AURA — app web instalável

AURA é um PWA (Progressive Web App): um site instalável na tela inicial do celular, com visualização ASCII 3D, conversa e configurações. A interface principal contém apenas a esfera, o espaço de perguntas/respostas e o botão de configurações. O ícone é uma esfera pontilhada inspirada na referência enviada.

## Usar no celular

Para instalar de verdade, o app precisa estar publicado em um endereço **HTTPS**. GitHub Pages é uma opção gratuita e conveniente, mas não é obrigatório: qualquer hospedagem estática HTTPS serve. Abrir o servidor de desenvolvimento no computador não instala o PWA no celular.

1. Publique o projeto no GitHub e habilite **Settings → Pages → Build and deployment → GitHub Actions**.
2. O workflow deste repositório compila e publica `dist/` quando houver push na branch `main`.
3. Abra o endereço HTTPS do Pages no celular.
4. **Android/Chrome:** menu ⋮ → **Instalar app** ou **Adicionar à tela inicial**. Quando disponível, o botão **Instalar AURA** aparece em Configurações.
5. **iPhone/iPad:** abra o endereço no Safari → **Compartilhar** → **Adicionar à Tela de Início**.
6. Abra o ícone AURA na tela inicial. A esfera e a interface carregam offline após a primeira visita; para conversar com Gemini, o celular precisa de internet.

Não publique uma chave Gemini no repositório ou no código. Cada dispositivo deve receber sua própria chave no painel Configurações. Nesta versão a chave fica no IndexedDB do navegador e é enviada diretamente à API; use apenas em dispositivo pessoal e considere que dados enviados no plano gratuito podem ser usados para melhorar produtos Google. Consulte as cotas atuais da sua conta no [Google AI Studio](https://aistudio.google.com/apikey).

## Executar localmente

Requer Node.js 20 ou mais recente:

```bash
npm install
npm run dev
```

O modo de desenvolvimento pode ser usado no computador para ajustar a chave: abra Configurações → **Chave Gemini API** → cole a chave criada no [AI Studio](https://aistudio.google.com/apikey) → **Salvar configurações**. Não envie a chave por chat. Para publicar a versão instalável, use o workflow HTTPS do GitHub Pages.

## Build e testes

```bash
npm test
npm run build
```

O build estático fica em `dist/`, usa caminhos relativos e inclui o manifesto, ícones e service worker para o PWA. O workflow de publicação requer que a branch padrão do repositório seja `main`; ajuste o gatilho em `.github/workflows/pages.yml` se for diferente.

## Capacidades

O modo offline entende comandos delimitados e transforma os caracteres em esfera, cubo, pirâmide, cilindro, toro, xícara, árvore, planeta, sistema solar, átomo e rede. A Gemini API é opcional para perguntas abertas. Histórico, memória explicitamente solicitada e configurações são armazenados localmente no dispositivo.
