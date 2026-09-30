# Prompt de Referência (EVA Cortex / Electron)
# Use este arquivo como entrada para um agente Trae em OUTRO PROJETO / OUTRO WORKSPACE
# Objetivo: aplicar os mesmos padrões usados no repositório d:\PAT\VOC

---

## CONTEXTO DO REPOSITÓRIO DE REFERÊNCIA

Repositório de referência para copiar a arquitetura e as convenções:
- Repositório: Eva-ltda / Qualidade-do-Ar
- Stack de referência: Electron + React + Vite + TypeScript + Tailwind + electron-builder + electron-updater
- Referências locais:
  - [package.json](file:///d:/PAT/VOC/package.json)
  - [main.ts](file:///d:/PAT/VOC/electron/main.ts)
  - [preload.ts](file:///d:/PAT/VOC/electron/preload.ts)
  - [settings.ts](file:///d:/PAT/VOC/electron/settings.ts)
  - [build-win.ps1](file:///d:/PAT/VOC/scripts/build-win.ps1)
  - [release.yml](file:///d:/PAT/VOC/.github/workflows/release.yml)

---

## BLOCO A: PATCH DE ATUALIZAÇÃO / AUTO-UPDATE POR GITHUB RELEASES

### OBJETIVO DO BLOCO A
Implementar um fluxo onde o time consegue publicar patches de atualização daqui (na máquina do desenvolvedor) e o aplicativo instalado no computador do cliente recebe a atualização automaticamente sem intervenção manual.

### REGRAS RÍGIDAS (NÃO NEGOCIÁVEIS)
1. Instalador oficial sempre é o Setup.exe (NSIS). NUNCA indicar entrega por pasta win-unpacked para cliente.
2. auto-update só funciona quando o app foi instalado pelo Setup.exe (NSIS). Portable não é cliente de auto-update.
3. Configurar `electron-updater` no processo principal (main do Electron).
4. Configurar `publish.provider = github` no `package.json` apontando para o owner e o repo reais do projeto.
5. Garantir que a GitHub Actions de release publique:
   - Setup.exe
   - Setup.exe.blockmap
   - latest.yml
6. Versionamento por tags Git semânticas `vX.Y.Z`.
7. Incrementar `version` em `package.json` (e `package-lock.json` se existir) antes de criar a tag.
8. Não publicar build/pasta/release/win-unpacked, artefatos grandes, cache no Git. Garantir `.gitignore` apropriado.

### ARQUIVOS QUE DEVEM SER MODIFICADOS NO PROJETO-ALVO
1. `package.json`
   - adicionar dependência `electron-updater`
   - preencher bloco `build.publish` com `provider: github`, `owner`, `repo`, `releaseType: release`
   - `build.win.target` deve conter `nsis` (Setup.exe)
   - `build.nsis` com opções de instalador amigável
2. `electron/main.ts` (ou equivalente do processo principal)
   - `import { autoUpdater } from 'electron-updater`
   - função `configureAutoUpdater()` com:
     - `autoDownload = true`
     - `autoInstallOnAppQuit = true`
     - verificar atualizações em `app.whenReady()`
     - periodicamente (ex.: check de 1 hora) se quiser
     - opcionalmente mostrar diálogos (Electron dialog) de “Atualização disponível” e “Atualização baixada, instalar?”.
3. `.github/workflows/release.yml`
   - trigger em tags `v*` e `workflow_dispatch`
   - runner `windows-2022`
   - Node 20, npm ci ou install
   - build renderer + electron + icon
   - `npx electron-builder --win --x64 --publish always`
   - `permissions.contents: write`
   - GH_TOKEN = `secrets.GITHUB_TOKEN`
   - opcionalmente injetar segredos que precisam entrar como `extraResources` (ex.: `telegram.secret.json` a partir de GitHub Secret, no estilo do job “Prepare Telegram secret (CI)”).
4. `.gitignore`
   - incluir `release/`, `dist/`, `dist-electron/`, `.electron-cache/`, etc.

### PADRÃO DE CHECK DE ATUALIZAÇÃO
- Na inicialização: `autoUpdater.checkForUpdatesAndNotify()`
- Periodicamente com `setInterval` de 30–60 minutos, se quiser.
- Eventos importantes:
  - `update-available`: notificar usuário
  - `update-not-available`: ignorar / log
  - `update-downloaded`: oferecer reinício
  - `error`: logar em desenvolvimento

### PADRÃO DE RELEASE (CHECKLIST)
1. `npm.cmd run typecheck` (ou equivalente do projeto)
2. `npm.cmd run lint` (se existir)
3. Atualizar `version` em `package.json` para `X.Y.Z` próximo patch (ex.: `0.0.9` → `0.0.10`)
4. Atualizar `package-lock.json` se existir (rodar `npm.cmd install --package-lock-only` ou confirmar no build)
5. `npm.cmd run build:win` ou build via CI (o CI deve ser a fonte oficial do artefato)
6. Commit com mensagem: `chore: release vX.Y.Z`
7. Criar tag: `git tag vX.Y.Z`
8. Push:
   - se estiver em branch main:
     - `git push origin HEAD`
     - `git push origin vX.Y.Z`
   - se estiver em detached HEAD (comum em sandbox/IDE):
     - `git push origin HEAD:main`
     - `git push origin refs/tags/vX.Y.Z`
9. Validar GitHub Actions: build verde.
10. Validar GitHub Releases: aparece tag vX.Y.Z com `latest.yml`, `.blockmap`, `Setup.exe`.
11. Validar no cliente: abrir app instalado via Setup.exe e ele deve detectar/digestar a nova versão.

### PADRÃO DE RESPOSTA FINAL DO AGENTE DEPOIS DE FAZER O BLOCO A
O agente deve retornar:
- Arquivos modificados com links no estilo `[file](file:///caminho/absoluto)`.
- Versão nova, commit local e tag criada.
- Comandos exatos para push final.
- Checklist do que o usuário deve conferir no GitHub: Actions verde, Release com 3 assets, cliente detectar update.
- Relatório de validação (typecheck, lint, build output files)

---

## BLOCO B: REVISÃO COMPLETA DE TEXTO DO MANUAL EM HTML

### OBJETIVO DO BLOCO B
Fazer uma revisão completa do conteúdo textual de um arquivo HTML de manual/documentação, alterando SOMENTE O TEXTO (conteúdo textual). NÃO modificar estrutura, estilos, código, layout.

### O QUE É PERMITIDO ALTERAR
- Apenas nós textuais dentro de tags HTML (texto de parágrafos, listas, títulos, cabeçalhos de tabela, células, rótulos em divs, spans, etc.).
- Palavras soltas sem acentuação.
- Concordância verbal e nominal.
- Regras de crase.
- Termos que precisam ser padronizados.

### O QUE É PROIBIDO ALTERAR
- HTML (tags, atributos, aninhamento)
- CSS / classes / IDs / estilos inline
- JavaScript / eventos
- estrutura de páginas, seções, painéis
- tabelas (linhas, células, colunas, ordem)
- listas (ordem, níveis)
- imagens, links, nomes de arquivos (exceto quando são texto descritivo da página e não href/src)
- comandos de terminal / comandos Telegram / códigos (deixar exatamente igual)
- nomes de tecnologias
- qualquer funcionamento do documento

### REGRAS DE CORREÇÃO LINGUÍSTICA
1. Corrigir todas as palavras sem acentuação; exemplos obrigatórios:
   - Documentacao → Documentação
   - Tecnica → Técnica
   - Operacional → Operacional
   - Instalacao → Instalação
   - Operacao → Operação
   - Exportacao → Exportação
   - Integracao → Integração
   - Atualizacao → Atualização
   - Versao → Versão
   - Visao → Visão
   - Historico → Histórico
   - Pressao → Pressão
   - Indicacao → Indicação
   - Informacoes → Informações
   - Usuarios → Usuários
   - Comunicacao → Comunicação
   - Solucao → Solução
   - Descricao → Descrição
   - Necessaria → Necessária
   - Pagina → Página
   - Area → Área
   - Ate → Até
   - Repositorio → Repositório
   - Conexao → Conexão
   - Relogio → Relógio
   - Selecao → Seleção
   - Grafico → Gráfico
   - Exibicao → Exibição
   - Classificacao → Classificação
   - Frequencia → Frequência
   - Estao → Estão
   - Botao → Botão
   - Geracao → Geração
   - Diretorio → Diretório
   - Sincronizacao → Sincronização
   - Situacao → Situação
   - Ultimo → Último
   - Proxima → Próxima
   - Vinculacao → Vinculação
   - Disponiveis → Disponíveis
   - Funcao → Função
   - Ultimos → Últimos
   - Memoria → Memória
   - Varios → Vários
   - Persistencia → Persistência
   - Configuracoes → Configurações
   - Necessario → Necessário
   - Praticas → Práticas
   - Acao → Ação
   - Alimentacao → Alimentação
   - Nao → Não
   - Tecnicas → Técnicas
2. Corrigir expressões gramaticais obrigatórias:
   - `acesso a internet` → `acesso à internet`
   - `menu iniciar` → `Menu Iniciar`
   - `area de trabalho` → `Área de Trabalho`
3. Melhorar a redação mantendo EXATAMENTE o mesmo significado.
   Exemplos de redação que devem ser aplicados quando o sentido couber:
   - Trocar:
     “Para notificações e comandos remotos funcionarem, o aplicativo precisa permanecer aberto...”
     por:
     “Para que as notificações e os comandos remotos funcionem, o aplicativo precisa permanecer aberto...”
   - Trocar:
     “Execute o instalador e avance pelas telas até concluir a instalação.”
     por:
     “Execute o instalador e siga as etapas até concluir a instalação.”
   - Trocar:
     “O operador pode ajustar o intervalo visual...”
     por:
     “O operador pode configurar o intervalo de atualização da interface...”
   - Trocar:
     “O botão Backup salva um CSV completo da coleta atual.”
     por:
     “O botão Backup gera um arquivo CSV contendo todos os dados da coleta atual.”
   - Trocar:
     “Se vários chats vencerem juntos...”
     por:
     “Se vários chats atingirem simultaneamente o horário programado...”
   - Trocar:
     “Exportação demorada”
     por:
     “Exportação demorada em coletas extensas”
4. Padronizar vocabulário da documentação técnica:
   - `software` para referir-se ao produto
   - `aplicativo` para referir-se à interface usada pelo operador
   - `sistema` para referir-se ao funcionamento interno / arquitetura

### PASSE OBRIGATÓRIO DE VALIDAÇÃO
Depois de alterar o texto, o agente deve:
1. Rodar uma busca regex por todos os termos da regra 1 SEM ACENTO (ex.: `Documentacao`, `Operacao`, etc.) no arquivo e confirmar que não sobraram ocorrências em nós textuais em português.
2. Validar que não foram alteradas classes, IDs, estilos, estrutura de tabelas/listas.
3. Se for um ambiente com diagnósticos, checar se o HTML continua sem diagnósticos.
4. Se o projeto tiver fluxo de PDF, regenerar o PDF no final SEM header/footer do navegador (modo: `--no-pdf-header-footer` ou equivalente).

### PADRÃO DE RESPOSTA FINAL DO AGENTE DEPOIS DE FAZER O BLOCO B
O agente deve retornar:
- Link para o HTML revisado
- Se PDF foi gerado, link para o PDF
- Resumo das classes de correções aplicadas (acentuação, crase, gramática, padronização vocabular)
- Confirmação de que estrutura/estilos permaneceram intactos
- Lista de checagem de termos mais comuns pesquisados para confirmar que não sobraram (Documentação, Instalação, Operação, Exportação, Atualização, Versão, Visão, Histórico, Pressão, Informações, Usuários, etc.)

---

## EXEMPLOS DE SAÍDA ESPERADA DO AGENTE (resumo textual após execução)

Exemplo de report BLOCO A:
```
✅ Patch vX.Y.Z preparado localmente.
- Modificado: [package.json](file:///caminho/abs/package.json)
- Modificado: [main.ts](file:///caminho/abs/electron/main.ts)
- Criado/atualizado: [release.yml](file:///caminho/abs/.github/workflows/release.yml)
- Typecheck: OK
- Build: setup.exe + blockmap + latest.yml

Comandos para publicar:
git push origin HEAD:main
git push origin refs/tags/vX.Y.Z
```

Exemplo de report BLOCO B:
```
✅ Revisão textual concluída sem alterar estrutura/estilos.
- HTML revisado: [manual-vX.Y.Z.html](file:///caminho/abs/docs/manual.html)
- PDF gerado: [manual-vX.Y.Z.pdf](file:///caminho/abs/docs/manual.pdf)
- Correções: acentuação, crase, gramática, padronização software/aplicativo/sistema.
- Verificação regex: Documentação, Instalação, Operação, Exportação, Atualização, Versão, Visão, Histórico, Pressão, Informações, Usuários, Comunicação, Solução, Descrição, Necessária, Página, Área, Até, Repositório, Conexão, Relógio, Seleção, Gráfico, Exibição, Classificação, Frequência, Botão, Geração, Diretório, Sincronização, Situação, Último, Próxima, Vinculação, Disponíveis, Função, Últimos, Memória, Vários, Persistência, Configurações, Necessário, Práticas, Ação, Alimentação, Não, Técnicas. — todos auditados e sem ocorrências indevidas de grafia sem acento nos nós textuais.
```

---

## MODO DE EXECUÇÃO QUE O AGENTE DEVE SEGUIR (prioridade)
1. Se houver blocos A e B no mesmo pedido: EXECUTAR BLOCO A PRIMEIRO, VALIDAR TUDO, DEPOIS EXECUTAR BLOCO B. Se o usuário pedir só um dos blocos, executar apenas o correspondente.
2. Antes de modificar, o agente deve inspecionar os arquivos reais do projeto-alvo para confirmar nomes (cuidado: main.js/main.ts, pasta electron/src/pasta raiz, etc.). Não aplicar cegamente nomes de arquivo do repositório de referência se o projeto alvo tiver nomes diferentes.
3. Sempre executar validações de typecheck / lint / build conforme o projeto-alvo.
4. Ao final, sempre entregar comandos prontos de git push e a lista exata do que conferir no GitHub / no cliente.

---

## FIM DO PROMPT DE REFERÊNCIA
