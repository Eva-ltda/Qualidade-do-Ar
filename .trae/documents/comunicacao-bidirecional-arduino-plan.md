# Comunicação Bidirecional Dashboard ↔ Arduino Implementation Plan

## 1. Repository Research (Estado atual da arquitetura)

- **Stack preservada:** Electron 42 + React 19 + Vite 8 + TypeScript estrito + SerialPort 12 + IPC whitelistado via preload contextBridge.
- **Camada serial atual (unidirecional, RX apenas):**
  - `electron/serial/SerialManager.ts`: `connect(port)` abre porta, lê frames via `ReadlineParser('\n')`, emite `rawLine` e `frame`. Sem `port.write()` existente.
  - Parser em `parseFrame(raw)` distingue **formato novo 5 campos pt-BR** `LOCAL;TEMP;UMID;PRESS;VOC_KOHM` (split `;`) vs legado 8/10 campos (split `,`). Não reconhece comandos de controle (ACK/STATUS/PONG).
  - `electron/main.ts` instancia `SerialManager`, assina eventos e faz `broadcast('serial:frame' | 'serial:rawLine' | 'serial:status')`. IPC handlers existem para `serial:listPorts`, `serial:getStatus`, `serial:connect`, `serial:disconnect`, `measurements:get/setLastLocation/save/clear` + dados/backup/notificações. **Nenhum `ipcMain.handle('serial:sendCommand')`.**
  - `electron/preload.ts` whitelist expõe `eva.connect`, `eva.setLastLocation`, `eva.onFrame/onRawLine/onStatus`. **Nenhuma API de envio.**
  - `src/types/eva.d.ts` Window.eva declarada sem `sendCommand/requestStatus/ping`.
- **Hook `src/hooks/useSerial.ts`:**
  - `setLocation(local)` hoje só faz `api.setLastLocation(local)` → `startStabilization(local)`. **Não envia nada para Arduino.** A troca de local é 100% UI (Dashboard assume que Arduino segue).
  - `measurementState` máquina 5 estados: `idle | stabilizing | ready | sampling | saved`. `stabilizing` de 120s começa **no clique** do usuário, não numa confirmação do Arduino — **contrário item 16 e 18 do prompt**.
  - `onFrame` confia cegamente em `frame.location` do serial — se Arduino enviar `INTERNO` enquanto UI diz EXTERNO, atualiza o card EXTERNO com dado INTERNO (o **bug item 21** que o prompt pede para corrigir).
- **UI:**
  - `Header.tsx` chip "Sensor: INTERNO/EXTERNO" usa `currentLocation` (UI). **Não há chip "Arduino: CONFIRMADO/AGUARDANDO/NÃO_RESPONDEU" (item 20).**
  - `LocationSelector.tsx` troca apenas visualmente. `StatusPanel.tsx` mostra `serialLines` (apenas RX, sem seta → TX enviado pelo Dashboard).
- **Arduino sketch `arduino/teste_dashboard_eva.ino`:**
  - Alterna automaticamente INTERNO → EXTERNO a cada `CYCLE_INTERVAL_MS = 180000UL` (3 min). **Não lê Serial.available()**. O sketch ignora tudo o que o Dashboard enviar — **raiz da desconexão UI vs Hardware.**

### Conclusão da pesquisa
A arquitetura existe para receber (RX) e persistir. Para TX faltam:
1. `SerialManager.sendCommand(command): Promise<void>` usando `port.write()` + `\n`.
2. Parser diferenciar **controle** (`ACK:*`, `STATUS:*`, `PONG`) de **dados de sensor** (`*;*;*;*;*`).
3. Evento de controle `serial:control` para main → renderer transmitir ACK/STATUS/PONG.
4. IPC + preload API whitelist para `eva.sendCommand`, `eva.onControl`, `eva.ping`, `eva.requestStatus`, `eva.requestSetLocation`.
5. Máquina de estados no renderer (`requestedLocation` vs `confirmedLocation`) com timeout 5s e validação "local frame deve casar confirmedLocation".
6. Serial TX também aparecer no Monitor Serial (`→ SET_LOCAL:EXTERNO`).
7. Sketch reescrito sem ciclo automático; lê comandos, responde ACK/STATUS/PONG, usa estado atual para enviar frames.

---

## 2. Files and Modules (o que tocar, ordenado por dependência)

| Arquivo | Alteração esperada |
|---|---|
| `electron/serial/types.ts` | Novo `SerialControlEvent` (ACK/STATUS/PONG/REQUEST/SET_LOCAL_TIMEOUT), novo `SerialRawLine` opcionalmente anota `direction: 'tx' \| 'rx'`, `SerialManagerEvents` expande com `control` e `txLine`. |
| `electron/serial/SerialManager.ts` | 1. `sendCommand(cmd): Promise<void>` escreve `cmd + '\n'` na porta atual; 2. **Novo parser de controle** antes de `parseFrame`: detecta prefixos `ACK:`, `STATUS:`, `PONG`; 3. Ao connectar, agenda `STATUS` 250ms após `open` (item 9 sincronização inicial); 4. Emite evento `txLine` com direção → para log. |
| `electron/main.ts` | 1. `ipcMain.handle('serial:sendCommand')`; 2. `'serial:requestStatus'` → sendCommand('STATUS'); 3. `'serial:ping'` → sendCommand('PING'); 4. `'serial:requestSetLocation' location → sendCommand('SET_LOCAL:'+location); 5. broadcast novo evento `'serial:control'` e `'serial:txLine'`; 6. mantém intactos backup/export/telegram/autoupdate/print/settings. |
| `electron/preload.ts` | 1. `eva.sendCommand(cmd): Promise<void>`; 2. `eva.requestStatus(): Promise<void>`; 3. `eva.ping(): Promise<void>`; 4. `eva.requestSetLocation(loc): Promise<{ok:boolean, reason?:string}>`; 5. `eva.onControl(handler): Unsubscribe`; 6. `eva.onTxLine(handler): Unsubscribe` (será usado no SerialPanel para log `→ ...`). |
| `src/types/eva.d.ts` | Tipar globalmente `SerialControlEvent` + novos métodos em `Window.eva` (item acima). Expandir `MeasurementState`? Não; o prompt não pede. Criar `ArduinoConnectionState = 'DESCONHECIDO' \| 'CONFIRMADO' \| 'AGUARDANDO_ACK' \| 'NAO_RESPONDEU' \| 'INCOMPATIVEL'`. |
| `src/hooks/useSerial.ts` | **Refator grande — máquina de estados local requested/confirmed:** 1. estados `requestedLocation`, `confirmedLocation`, `arduinoState`, `timeoutHandleRef`; 2. `requestSetLocation(loc)` = `requested=loc` → `api.requestSetLocation(loc)` → `arduinoState='AGUARDANDO_ACK'` → `setTimeout 5s → NÃO_RESPONDEU`; 3. `onControl` recebe `ACK:*` → confirma → chama `startStabilization` (item 16: estabilização só após ACK!) e cancela timeout; `STATUS:*` atualiza confirmedLocation; 4. **Validação item 5:** `onFrame(frame)` — se `confirmedLocation` existir e `frame.location !== confirmedLocation` → log `DADO IGNORADO - esperado X, recebido Y` em `serialLines` e **drop** (não atualiza lastFrame/history nem recordsRef); 5. `recordsRef.push` SOMENTE se passar validação; 6. `connect` sucesso → `requestStatus()` para sincronizar. |
| `src/App.tsx` | Adicionar prop `arduinoState` no Header e MeasurementPanel. `currentLocation` visual pode ser `requestedLocation` (o que usuário pediu) enquanto chip Arduino mostra estado confirmado/hardware. |
| `src/components/LocationSelector.tsx` | Props agora recebem `requested` (visual do botão ativo) e `confirmed` opcional para hint "Aguardando confirmação do Arduino…" (exibe no card quando `AGUARDANDO_ACK`). |
| `src/components/Header.tsx` | Acrescentar chip colado ao Sensor: "Arduino: CONFIRMADO/AGUARDANDO/NÃO RESPONDEU" (item 20). 4 paletas: CONFIRMADO verde, AGUARDANDO âmbar, NÃO_RESPONDEU vermelho, DESCONHECIDO cinza. |
| `src/components/StatusPanel.tsx` ou `serialLines render` | Linhas no monitor agora diferenciar visualmente `→ TX cor ciano`, `← RX ACK/STATUS/PONG cor verde-2`, `← RX DADOS cor neutra` (item 11). |
| `src/components/MeasurementPanel.tsx` | Exibir linha extra quando `arduinoState` não CONFIRMADO. |
| `src/components/SerialPanel.tsx` | Atualizar documentação do protocolo: painel superior "Formato Serial" agora lista também os 4 comandos bidirecionais + respostas. |
| `arduino/teste_dashboard_eva.ino` | **Reescrita do loop:** 1. remover `CYCLE_INTERVAL_MS` automático; 2. criar `enum LocalAtual { INTERNO, EXTERNO } = INTERNO`; 3. `loop()` checar `Serial.available()` primeiro; 4. ler linha completa → parsear `SET_LOCAL:INTERNO/EXTERNO` → `ACK:*`; `STATUS` → `STATUS:*`; `PING` → `PONG`; 5. `sendFrame()` sempre usa `LocalAtual` atual para prefixo. 6. setup envia "EVA ready\n" (opcional). **Mantém formato 5 campos pt-BR (item 103).** |
| `package.json` scripts? | Nenhum. Mantém `typecheck/lint/build:renderer/build:electron`. |

---

## 3. Implementation Steps (ordem de dependência, 10 passos)

### Passo 1 — Tipos no Electron serial/types.ts
- Expandir `SerialManagerEvents` com eventos `control` e `txLine`.
- Definir `SerialControlType = 'ACK' | 'STATUS' | 'PONG' | 'PING_TIMEOUT' | 'SET_LOCAL_TIMEOUT' | 'TX_SENT'`.
- Expandir `SerialRawLine` com `direction?: 'tx' | 'rx'` e `kind?: 'control' | 'data' | 'info'` para UI diferenciar visualmente.

### Passo 2 — SerialManager: sendCommand + parser controle + STATUS inicial
- Método público `async sendCommand(command: string): Promise<void>`: validar `port?.isOpen`; `port.write(command + '\n', (err) => …)`; emitir `txLine`.
- Antes do bloco `parseFrame(trimmed)` no parser: se linha começa com `ACK:` → emitir `control: { type:'ACK', location }`. Senão `STATUS:` → emitir `control: {type:'STATUS', location}`. Senão `=== 'PONG'` → `control:{type:'PONG'}`. Se for controle **não chamar parseFrame**, não atualizar `lastLocation`.
- Ao final de `connect()` (porta aberta): `setTimeout(() => this.sendCommand('STATUS').catch(()=>{}), 250)` para sincronizar.
- Após evento `rawLine` rx, emitir com `direction:'rx'`, tx com `direction:'tx'`.

### Passo 3 — main.ts: IPC handlers para TX e broadcast de controle
- `ipcMain.handle('serial:sendCommand', async (_e, cmd) => serial.sendCommand(cmd))`
- `ipcMain.handle('serial:requestStatus', ...)`
- `ipcMain.handle('serial:ping', ...)`
- `ipcMain.handle('serial:requestSetLocation', async (_e, loc:MeasurementLocation))`: validar `loc` → `serial.sendCommand('SET_LOCAL:' + loc)` → resolve.
- Subscrever no `serial.on('control', ev => broadcast('serial:control', ev))` e `serial.on('txLine', ln => broadcast('serial:txLine', ln))`.
- Verificar `serial:connect` sucesso → já trigger STATUS do próprio SerialManager (OK duplicado, sem problema).

### Passo 4 — preload.ts: whitelist APIs novas
- `eva.sendCommand, eva.requestStatus, eva.ping, eva.requestSetLocation`.
- `eva.onControl` (listener `'serial:control'`) e `eva.onTxLine` (listener `'serial:txLine'`).
- Não remover nenhuma API existente.

### Passo 5 — eva.d.ts: atualizar Window.eva global
- Declarar `SerialControlEvent` e `ArduinoConnectionState` global.
- Tipar cada nova função de `eva` de forma forte (não `any`).

### Passo 6 — Hook useSerial.ts: máquina requested/confirmed + timeout + validação local de frames
#### 6a. Novos states + refs
```
requestedLocation: MeasurementLocation
confirmedLocation: MeasurementLocation | undefined
arduinoState: ArduinoConnectionState
pendingAckTimer: NodeJS.Timeout | undefined (em ref)
```

#### 6b. `requestSetLocation(location)`
1. Se `pendingAckTimer` existir → `clearTimeout` e limpar.
2. `requestedLocation = location`.
3. `arduinoState = 'AGUARDANDO_ACK'`.
4. Chamar `api.requestSetLocation(location)`.
5. Criar timer 5000ms → ao disparar: `arduinoState = 'NAO_RESPONDEU'` e NÃO iniciar estabilização. Adicionar linha no serialLines `[HH:MM:SS] ⚠️ Arduino não confirmou a mudança para {loc}.`

#### 6c. `onControl` handler
- `ACK:loc` → se `loc === requestedLocation`: cancelar timer, `confirmedLocation = loc`, `arduinoState = 'CONFIRMADO'`, **CHAMAR `startStabilization(loc)`** (item 16 estabilização só após ACK!). Log serial `← ACK:{loc}`.
- `STATUS:loc` → `confirmedLocation = loc`; se arduinoState estava DESCONHECIDO → CONFIRMADO. Sincroniza `requestedLocation` se undefined.
- `PONG` → linha `← PONG` (apenas log).

#### 6d. **Validação item 5 crítica** em `api.onFrame(frame)`
```ts
const expected = confirmedLocation
if (expected && frame.location !== expected) {
  // DADO IGNORADO — NÃO atualiza nada. Só log.
  pushSerialLine(`DADO IGNORADO - esperado ${expected}, recebido ${frame.location}`)
  return
}
// passar válido adiante: setLastFrame, recordsRef, history point (após MEASUREMENT_INTERVAL_MS).
```

#### 6e. `connect` retorna → se status connected → `void api.requestStatus()` para sincronizar inicial.

### Passo 7 — UI: Header / LocationSelector / MeasurementPanel / StatusPanel
- **Header.tsx:** props recebem `requestedLocation`, `confirmedLocation`, `arduinoState`. Render chip duplo: "Sensor: {requested}" (igual antes) **ao lado** "Arduino: {estado}" (item 20). Cores por estado.
- **LocationSelector:** `current={requestedLocation}` (ativo visual do clique). Hint quando `arduinoState === 'AGUARDANDO_ACK'`: "Solicitando mudança… Arduino ainda não confirmou". Desativar botões durante estado AGUARDANDO? Sim, evita múltiplos requests concorrentes → `disabled={arduinoState === 'AGUARDANDO_ACK'}`.
- **MeasurementPanel:** Linha "Estado do Arduino" acima da estabilização.
- **StatusPanel serialLines:** quando `line.direction === 'tx'` prefixar `→ ` cyan; quando `kind === 'control' && rx` prefixar `← ` verde; dado normal `← ` cinza (item 11).

### Passo 8 — SerialPanel docs atualizados
- Seção nova "Protocolo de Comandos" acima dos formatos de dados, listando:
  ```
  Dashboard → Arduino:        Arduino → Dashboard:
  SET_LOCAL:INTERNO           ACK:INTERNO
  SET_LOCAL:EXTERNO           ACK:EXTERNO
  STATUS                      STATUS:INTERNO / STATUS:EXTERNO
  PING                        PONG
  ```

### Passo 9 — Sketch Arduino atualizado (simulador e físico)
Remover ciclo automático. Implementar parser comando:
```cpp
// enum LocalAtual currentLocal = INTERNO;  // inicial
// void processSerialLine(String& line)
//   if line == "PING" → Serial.println("PONG");
//   else if line == "STATUS" → Serial.print("STATUS:"); Serial.println(currentLocal ? "EXTERNO":"INTERNO");
//   else if line.startsWith("SET_LOCAL:") → extrair → ACK.
// loop: if Serial available → read line → processSerialLine.
//       else every 2s sendFrame(prefix currentLocal).
```

### Passo 10 — Validação
Executar em ordem e corrigir erros de tipagem/lint:
1. `D:\npm.cmd run typecheck` → 0 erros.
2. `D:\npm.cmd run lint` → 0 erros.
3. `D:\npm.cmd run build:renderer` → sucesso.
4. `D:\npm.cmd run build:electron` → sucesso.
5. Diagnostics VS Code 0 arquivos.

---

## 4. Dependencies and Considerations

- **Compatibilidade legado:** parser antigo de frames (split `,` 8/10 campos) **permanece intacto**, pois prompt item 26 pede manter.
- **Não quebrar Telegram/Backup/Export/AutoUpdate/Print:** esses só leem `lastSensorFrame` ou `collectionFrames`; nenhum é alterado. Apenas a validação de local agora filtra frames inválidos antes de chegar ao buffer de coleta.
- **Estabilização não começa no clique:** item 16 e 18 do prompt. A mudança no useSerial (Passo 6c) é o ponto crítico; se houver ACK do Arduino → estabilização. Timeout → NÃO_RESPONDEU e sem estabilização.
- **Ping / Status podem falhar se a porta não conectou:** Tratar erro de `sendCommand` → emitir log no serialLines `Falha ao enviar comando: {msg}` ao invés de crashar.
- **RecordsRef e history CSV:** frames inválidos (local errado item 5) NÃO entram → backup/export ficam íntegros (item 5 "Não atualizar medição externa").
- **Múltiplos envios concorrentes no LocationSelector:** `disabled` durante `AGUARDANDO_ACK` evita. Também timer pendente é clearTimeout em cada novo request.
- **Sketch Arduino enviando LOCAL errado item 21:** será impossível após implementação, pois:
  1. Dashboard envia SET_LOCAL:EXTERNO
  2. Arduino responde ACK:EXTERNO → confirmedLocation=EXTERNO
  3. Validação em 6d rejeita qualquer frame com location !== confirmedLocation → log DADO IGNORADO.
- **Conectou e Arduino está rodando sketch antigo (sem comandos implementados):**
  - SerialManager tenta enviar STATUS após 250ms → nenhuma resposta → `confirmedLocation` fica `undefined`.
  - Hook pode manter `arduinoState = 'DESCONHECIDO'` ou cair em `NÃO_RESPONDEU` no primeiro `requestSetLocation`. Nesse cenário frames ainda passam? Minha decisão: se `confirmedLocation` ainda é undefined (sem nenhum STATUS/ACK recebido ainda) → **manter comportamento antigo de confiar em frame.location** para não quebrar operação com sketches antigos. O prompt item 5 é para quando há confirmedLocation definido.
- **Locale pt-BR:** nenhuma alteração no formatNumber / CSV.

---

## 5. Validation (testes obrigatórios item 23 do prompt)

| Teste | Cenário | Resultado esperado |
|---|---|---|
| 1 (PING) | Conectar porta → painel admin interno botão ou API `eva.ping()` → `serial.sendCommand('PING')` | ← `PONG` aparece no monitor. |
| 2 (STATUS inicial) | Conectar porta COM | `→ STATUS` aos 250ms. ← `STATUS:INTERNO`. Header exibe `Arduino: CONFIRMADO`. |
| 3 (Troca EXTERNO com sucesso) | Clicar em Externo no LocationSelector | 1. → `SET_LOCAL:EXTERNO`. 2. ← `ACK:EXTERNO`. 3. `arduinoState=CONFIRMADO`. 4. `confirmedLocation=EXTERNO`. 5. Inicia estabilização 120s. |
| 4 (Frame incompatível) | Simular envio de `INTERNO;25,00;60,00;952,00;50,00` enquanto confirmed=EXTERNO. | Log `DADO IGNORADO - esperado EXTERNO, recebido INTERNO`. Nenhum card atualiza, history não ganha ponto, recordsRef não recebe. |
| 5 (Frame compatível) | Receber `EXTERNO;28,00;52,00;951,00;43,00` confirmed=EXTERNO. | Aceito normalmente. Atualiza card, history a cada 2s OK. |
| 6 (Troca INTERNO com sucesso) | Clicar Interno → confirmado. | ACK:INTERNO → nova estabilização começa. |
| (Extra) Timeout | Desligar RX no Arduino → clicar Externo. | Após 5s `Arduino: NÃO RESPONDEU`. Sem contador de estabilização iniciado. |

### Validações estáticas automáticas
```
D:\npm.cmd run typecheck
D:\npm.cmd run lint
D:\npm.cmd run build:renderer
D:\npm.cmd run build:electron
```

---

## 6. Risks

| Risco | Mitigação |
|---|---|
| Frames legados (8/10 campos) quebrando validação de local | Validação item 5 **só executa se `confirmedLocation` definido**. Legacy dual sensor vai continuar funcionando pois confirmedLocation nunca recebe (sketch não implementa comando). |
| SendCommand falha sem porta aberta | `SerialManager.sendCommand` lança? → envolver try/catch em main.ts handle e retornar `{ok:false, error}`. Hook sempre try/catch para não quebrar UI. |
| Timer pendingAck vaza (múltiplos clicks) | `setLocation` novo sempre limpa timer do request anterior. |
| Electron `port.write` callback sem promessa | Encapsular em `new Promise((res, rej) => port.write(cmd + '\n', err => err ? rej(err):res()))` no SerialManager. |
| SerialPanel log crescendo muito | Já tem `.slice(-200)`. Manter. |
| Arduino antigo sem parser comandos (backward compat) | Estado inicial `DESCONHECIDO` vs `NAO_RESPONDEU` separados. Quando `confirmedLocation === undefined`, validação de local é pulada. |
| Prompt item 17 (Medidas salvas) pede voltar salvar? — item conflita com request anterior do dia que removeu | **Prompt do arquivo diz item 17 "Salvar medição" mas a request anterior (manhã do dia 30/09) tinha REMOVIDO o botão Salvar medição e todo o fluxo de save.** Vou **preservar estado atual (SALVAR continua REMOVIDO)** pois nenhuma das fotos/descritivas atuais pede recriar. A regra item 17 no TXT é de um template anterior; aplicar NÃO; mantém última decisão do usuário. |

