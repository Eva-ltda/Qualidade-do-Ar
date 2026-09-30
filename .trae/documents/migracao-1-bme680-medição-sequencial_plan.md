# Migração 2×BME680 → 1×BME680 com Medição Sequencial Implementation Plan

## Repository Research

### Arquitetura atual (2 sensores físicos simultâneos)
- **Fluxo serial:** Arduino envia 8 ou 10 campos CSV (`.split(',')`), SerialManager.parseFrame() mapeia para `tempInterno/humInterno/pressInterno/vocInternoReal/vocInternoCorrigido + tempExterno/humExterno/pressExterno/vocExternoReal/vocExternoCorrigido`
- **Tipos:** `SensorFrame` em `electron/serial/types.ts` e `src/types/eva.d.ts` — 12 campos numéricos duplicados (interno + externo)
- **useSerial:** recebe `onFrame`, acumula `recordsRef`, amostra a cada `sampleIntervalMs` (default 2s), mantém histórico de 30 pontos (interno vs externo como 2 linhas no mesmo chart)
- **App.tsx:** grid 12 colunas com 2× `EnvironmentSection` + 2× `VOCGauge` lado a lado; `vocToPPM(vocInternoCorrigido)` e `vocToPPM(vocExternoCorrigido)` separados
- **CSV export:** buildCsvTextAsync em useSerial gera 12 colunas (tempInterno_c…vocExterno_kohm) com `;` + `sep=;` + decimais vírgula
- **Telegram (main.ts):** `buildTelegramVocDataMessage()` exibe VOC/PPM internos e externos separados; `sendTrackedNotification(...)` reage a início/fim de coleta
- **airQuality.ts:** VOC→PPM tabela + 5 faixas (Excelente/Boa/Moderada/Ruim/Muito Ruim) — deve continuar FONTE ÚNICA
- **Header:** COM, Backup, Exportar — continuam iguais
- **StatusPanel:** monitor serial — continua igual
- **NotificationPanel:** settings Telegram — continua igual, mas `lastSentKind/collectionState` que atualmente reage a 2-sensor ativo não pode mais presumir 2 frames simultâneos

### Restrições do usuário extraídas do prompt de migração
1. **NÃO recriar projeto** — apenas adaptar
2. **1 sensor físico** (`BME680`) usado **sequencialmente**: INTERNO → EXTERNO
3. **Nunca inferir localização**: seleção EXPLÍCITA por botão `[ INTERNO ] [ EXTERNO ]`
4. **Estabilização não-bloqueante** após cada troca de local: **120s (STABILIZATION_TIME_MS constante centralizada)**
5. **Salvar medição** = média de **10 amostras (MEASUREMENT_SAMPLES)** com **2s (MEASUREMENT_INTERVAL_MS)** entre elas → resultado único salvo
6. **Frame serial recebido ≠ medição salva** — só entra no histórico de medições após o clique em salvar
7. **Medições salvas são independentes**: trocar para EXTERNO NÃO apaga a medição interna salva
8. **NÃO recalibrar por ambiente** — fator de correção é do sensor, único
9. **Comparação INTERNO × EXTERNO** só quando ambas as medições salvas existirem
10. **Nenhum dado simulado/preechido com zero**
11. **Novo formato serial:** `LOCAL;TEMPERATURA;UMIDADE;PRESSAO;VOC_KOHM` (decimal vírgula pt-BR no Arduino!); manter compatibilidade temporária com formato antigo 8/10 campos se simples
12. **CSV novo:** `sep=;\nData/Hora;Local;Temperatura;Umidade;Pressão;VOC;Índice VOC`
13. **Histórico Recharts:** linhas de medições SALVAS internas e externas (pontos reais em horário)
14. **SerialPanel atualizado** para documentar formato 5 campos
15. **Constantes centralizadas:** `STABILIZATION_TIME_MS`, `MEASUREMENT_SAMPLES`, `MEASUREMENT_INTERVAL_MS` em `src/lib/constants.ts`
16. **IPC não aumentado** para esta fase — a seleção de localização roda NO RENDERER (mesmo que futuramente o dashboard envie comando serial por SerialManager → etapa futura)

## Files and Modules

| Arquivo | Alteração esperada |
|---------|-------------------|
| `electron/serial/types.ts` | Novo `MeasurementLocation = 'INTERNO'/'EXTERNO'`; redefinir `SensorFrame` p/ sensor único + aliases backward-compat temporários `tempInterno←temperature` etc. |
| `electron/serial/SerialManager.ts` | `parseFrame()` aceita **novo formato (;)** e mantém **compatível formato antigo (, 8/10 campos)** mapeando para localização vinda do renderer ou 'INTERNO' como fallback |
| `electron/preload.ts` | Tipar `MeasurementLocation`, atualizar `SensorFrame`; sem adicionar novos canais IPC nesta etapa |
| `electron/main.ts` | Adaptar `buildTelegramVocDataMessage`, `notifyCollectionStarted/Stopped/Heartbeat` para 1 sensor + last saved measurement; `buildBackupCsvText`/`saveAutomaticBackup` → novo schema CSV |
| `electron/settings.ts` | Adicionar campo `lastLocation?: MeasurementLocation` e `savedMeasurements?: {interno?, externo?}` em `Settings` (persistência opcional entre reinícios) |
| `src/types/eva.d.ts` | Mesmo `MeasurementLocation`; redefinir `SensorFrame` com 5 campos + aliases backward-compat temporários |
| `src/lib/constants.ts` (NOVO) | `STABILIZATION_TIME_MS=120_000`, `MEASUREMENT_SAMPLES=10`, `MEASUREMENT_INTERVAL_MS=2000` |
| `src/lib/format.ts` | Adicionar `formatDuration(ms): mm:ss` para contador estabilização |
| `src/hooks/useSerial.ts` | Trabalhar com 1 leitura atual; CSV builder novo (5 colunas + local + índice); export/backup usam medições salvas, não raw stream |
| `src/App.tsx` | **NOVO FLUXO**: seletor `[INTERNO]/[EXTERNO]`, estabilização contador, estado medição, 1 painel sensor atual, 1 gauge atual, painel comparação, histórico Recharts (2 linhas com pontos salvos) |
| `src/components/MeasurementPanel.tsx` (NOVO) | Sensor atual: local, 4 SensorCards (°C/ %/ hPa/ VOC kΩ), status estabilização com contador, botão `[SALVAR MEDIÇÃO]` bloqueado enquanto estabiliza/mede |
| `src/components/LocationSelector.tsx` (NOVO) | `[ INTERNO ][ EXTERNO ]` com destaque visual, mudança dispara nova estabilização |
| `src/components/ComparisonPanel.tsx` (NOVO) | Tabela: PARAMÊTRO × INTERNO × EXTERNO; mostra placeholder se medição faltante |
| `src/components/HistoryChart.tsx` | Adaptar: 2 séries (`interno`/`externo`) originadas APENAS de medições SALVAS, não de raw frames |
| `src/components/VOCGauge.tsx` | Reutilizar como está; agora só 1 instância no painel sensor atual + opcionalmente 2 mini na comparação |
| `src/components/SensorCard.tsx` | Sem alteração — reutilizar |
| `src/components/Header.tsx` | Adicionar chip visual `Sensor: INTERNO/EXTERNO` no canto se couber |
| `src/components/SerialPanel.tsx` | Atualizar documentação: **formato novo** `LOCAL;T;U;P;VOC` + observação "sensor único mede os dois ambientes sequencialmente" |
| `src/components/NotificationPanel.tsx` | Sem alterações estruturais; textos de status ajustados se mencionarem 2 sensores |
| `src/components/StatusPanel.tsx` | Sem alteração |
| `src/components/Footer.tsx` | Ajustar texto: `Arduino Uno + 1x BME680 (medição sequencial ambientes)` |
| `arduino/teste_dashboard_eva.ino` | Atualizar sketch de teste para **novo formato (;)** enviando `INTERNO;T;U;P;VOC` ou `EXTERNO;…` com controle de estado no próprio sketch |
| `docs/prompt-dashboard-arquitetura-hierarquia.md` | Atualizar referências de SensorFrame, layout, CSV no final (opcional, após tudo fechar) |

## Implementation Steps (ordem de dependência)

1. **Tipos & Constantes (zero risco quebrar UI/serial ainda)**
   - Criar `src/lib/constants.ts` com as 3 constantes
   - Adicionar `formatDuration()` em `src/lib/format.ts`
   - Em `electron/serial/types.ts`: criar `MeasurementLocation`; redefinir `SensorFrame` (novos campos `location/temperature/humidity/pressure/voc + raw + receivedAt`); manter aliases backward-compat **TEMPORÁRIOS** `tempInterno=location==='INTERNO'?temperature:NaN` como getters? MELHOR: manter os antigos campos *populados* no SerialManager (interno recebe se INTERNO, externo recebe se EXTERNO; se formato legacy 8/10 campos ambos recebem como antes). Assim uso quebrado temporariamente zero.
   - Em `src/types/eva.d.ts`: mesmo `MeasurementLocation` + redefinido `SensorFrame`

2. **Camada Serial (compatibilidade DUAS VIAS)**
   - `SerialManager.parseFrame()`: detecta delimitador `;` → **NOVO** split `;`, aceita decimal vírgula brasileira (trocar `,` → `.` antes `Number()`); ignora 6º campo índice opcional. Formato antigo `,` com 8/10 campos continua suportado como fallback.
   - `parseFrame` **também lê `location` na primeira coluna** e coloca no novo `SensorFrame.location`.
   - Se chegar formato legacy sem location, preenche `location` com último valor salvo em settings (fallback 'INTERNO').
   - Campos antigos `tempInterno/vocInternoCorrigido/tempExterno/vocExternoCorrigido` etc. continuam preenchidos conforme `location`: se INTERNO → campos internos recebem valores, externos NaN; se EXTERNO → campos externos recebem, internos NaN; se formato legacy 10 campos, ambos são preenchidos como hoje. Isso garante zero quebra nas dependências antigas por enquanto.

3. **Persistência settings + preload tipagem**
   - `Settings` em `electron/settings.ts` ganha `lastLocation` e `savedMeasurements?: SavedMeasurements` opcionais
   - `preload.ts` atualiza imports para novos tipos
   - `main.ts`: atualizar `buildTelegramVocDataMessage` para usar lastFrame novo + lastSavedMeasurement (se não tiver salvo um e outro, mostra "aguardando medição X")

4. **CSV novo formato**
   - `useSerial.buildCsvTextAsync`: novo schema `sep=;` + Data/Hora;Local;Temperatura;Umidade;Pressão;VOC kΩ;Índice VOC. Decimais vírgula.
   - `main.ts` `buildBackupCsvText`: mesmo schema (ainda usa dados coletados internamente no processo principal? Atualmente main tem sua própria cópia `collectionFrames: SensorFrame[]` — então main também deve re-exportar no novo schema, mantendo campos antigos só se chegar frame legacy 10 colunas)

5. **Renderer: Componentes NOVOS** (apenas criados, ainda não integrados no App)
   - `LocationSelector.tsx`
   - `MeasurementPanel.tsx` (usa `formatNumber/formatInt/formatDuration`)
   - `ComparisonPanel.tsx`

6. **useSerial: gerenciar estabilização + medições + histórico**
   - Adiciona estado: `currentLocation`, `stabilizationEndsAt?`, `measurementState: 'idle'|'stabilizing'|'ready'|'sampling'|'saved'`, `samplingBuffer: SensorFrame[]`, `savedInternal?: SavedMeasurement`, `savedExternal?: SavedMeasurement`
   - Exporta actions: `setLocation(loc)` → inicia estabilização + zera buffer; `startSaveMeasurement()` → acumula 10 amostras 2s → média → salva; `clearSession()` → apaga savedInternal/savedExternal com confirmação (UI-side)
   - `buildCsvTextAsync` itera savedInternal + savedExternal ordenados por horário
   - `history` (Recharts) agora é array `{t, ts, interno?, externo?}` gerado a partir dos saves, não raw stream

7. **App.tsx — REFATORAÇÃO LAYOUT**
   - Remover `EnvironmentSection` duplicado (interno + externo) da mesma linha
   - Linha 1: LocationSelector (sticky?) + MeasurementPanel (12 col)
   - Linha 2: VOCGauge (único, atual) + Histórico de medições salvas (Recharts)
   - Linha 3: ComparisonPanel (12 col)
   - Linha 4: StatusPanel (12 col md=4) + SerialPanel (12 col md=8)
   - Linhas 5–6: NotificationPanel + Footer
   - Campos `ppmInterno/ppmExterno` de App agora vêm: para leitura atual = `lastFrame` único; para comparação = de savedInternal/savedExternal

8. **Atualizações de componentes existentes menores**
   - Header.tsx: chip local atual
   - Footer.tsx: atualizar texto hardware
   - SerialPanel.tsx: documentar formato novo
   - NotificationPanel.tsx: procurar menções a internos+externos simultâneos e ajustar
   - HistoryChart.tsx: aceitar optional interno/externo por ponto, renderizar sem interpolar zeros
   - VOCGauge.tsx: sem alteração (usar em 2 locais)

9. **Sketch Arduino de teste**
   - `arduino/teste_dashboard_eva.ino`: estado (INICIAL→INTERNO estabiliza→ENVIA; ao receber comando EXTERNO via serial? Simples versão: cicla automaticamente a cada 3 minutos para teste, ou usa botão de pressão para alternar se quiser; no mínimo envia linhas no formato `LOCAL;T;U;P;VOC` com decimal vírgula compatível pt-BR no dashboard.

10. **Ajuste Telegram (main.ts)**
    - `buildTelegramVocDataMessage`: exibir última medição salva (interna e externa se disponível) e atual (stream). Atualizar mensagens de notificação para "sensor conectado / última medição / sem comunicação".
    - `notifyCollectionStarted/Stopped`: agora "coleta iniciada" = quando estabilização termina e primeira medição salva. (Simplificar: manter como "dados serial sendo recebidos" atual, não quebrar Telegram por enquanto — depois ajusta.)

11. **Backward-compat aliases limpeza (opcional, após tudo)**
    - Remover campos `tempInterno`, `vocExterno` etc. de SensorFrame DEPOIS que todos os consumidores (App, useSerial, Telegram, CSV main) usam os novos campos.
    - Primeira versão roda COM aliases para minimizar risco.

## Dependencies and Considerations

- **Formato serial:** O usuário pediu decimal **vírgula no Arduino** (`25,60`). Isso força o dashboard a fazer `s.replace(',', '.')` ANTES de `Number(s)` no SerialManager — obrigatório e tem que funcionar para o formato novo. Formato antigo mantém ponto (já que o sketch atual envia `25.3`).
- **Compatibilidade temporária com SensorFrame antigo:** manter campos antigos preenchidos = 2 semanas sem quebrar Telegram/main/buildBackup enquanto trocamos gradualmente. No final eles saem.
- **Estabilização e medição NÃO bloqueiam a recepção serial:** usar contadores de parede (Date.now() + setInterval no renderer 500ms), NÃO `await` que impede frames de chegar. O buffer de amostragem usa os `onFrame` que já estão acontecendo — é só "pegar os próximos 10 frames úteis dentro do intervalo".
- **Histórico não inventa pontos:** se só tem interno salvo, o Recharts plota só a linha verde (interno); externo não aparece, e vice-versa. NUNCA preencher com 0.
- **Seleção de local → Arduino:** usuário (item 36 do prompt) quer que dashboard envie `INTERNO\n` / `EXTERNO\n` ao Arduino. Adicionar como etapa de implementação **12 (pós-validação)** para não atrasar: `ipcRenderer.invoke('serial:sendCommand', txt)` → `main.ts` → `SerialManager.send(text + '\n')`. Se usuário aprovar, incluímos no passo 5+; senão deixamos a seleção como renderer-side apenas.
- **Persistência savedMeasurements:** settings.json (userData) é o lugar certo; não localStorage. Facilita reinício do app sem perder as últimas medições salvas.
- **airQuality.ts INTACTO:** nenhuma linha alterada. Só recebe `vocCorrigido` de um ponto de cada vez.

## Validation (obrigatórios após cada grupo de etapas)

1. **TypeScript geral:** `D:\npm.cmd run typecheck` (pipeline principal = `tsc -b && tsc -p tsconfig.electron.json`)
2. **ESLint:** `D:\npm.cmd run lint`
3. **Build renderer + electron:** `D:\npm.cmd run build:renderer` e `D:\npm.cmd run build:electron`
4. **Sketch Arduino validação:** ler 20 linhas do SerialPanel novas e confirmar:
   - `INTERNO;25,60;61,30;955,40;54,20` → parseia corretamente
   - Formato antigo `25.3,58,1012,42.7,40.8,29.1,66,1008,55.4,52.0` → continua parseando (backward compat)
5. **Estabilização manual:**
   - Clica INTERNO → contador 2:00 → botão SALVAR desabilitado
   - Zera contador ao clicar EXTERNO
   - Depois de 120s → botão SALVAR habilitado
6. **Salvamento:**
   - Clica SALVAR → bufferiza 10 amostras 2s → aparece em ComparisonPanel
   - Salva interno → aviso "agora mova para externo"
   - Salva externo → aviso "comparação disponível"
   - Comparison mostra só colunas de medições realmente salvas; faltante = "Aguardando"
7. **CSV export:**
   - Salva interno e externo → Exportar → abrir no Excel pt-BR: colunas reconhecidas, vírgula decimal ok, `sep=;` ok
   - Backup CSV idem com metadata header
8. **Telegram NÃO quebrou:**
   - Painel carrega settings, botão "Enviar teste Telegram" responde (mesmo sem token configurado deve mostrar "Token não configurado" em vez de erro de tipo)
9. **Auto-update intacto:**
   - `configureAutoUpdater()` em main.ts não sofreu alteração de assinatura / importações

## Risks

| Risco | Mitigação |
|-------|-----------|
| Mudança de SensorFrame quebra uso em 20+ lugares de uma vez | Campos antigos mantidos temporariamente preenchidos pelo SerialManager baseado em `location` + aliases de tipo opcional |
| Decimal vírgula do Arduino pt-BR não ser convertido → NaN em tudo | Teste unitário manual no SerialManager.parseFrame: string `25,60` → 25.6; `955,40` → 955.4 |
| Estabilização bloqueia UI e salva medições antes do tempo | Contadores impulsionados por `Date.now()` + setInterval(500ms), não `await/delay`. O `measurementState` é a única fonte verdade. |
| Histórico Recharts plotando todo frame serial → poluído | Novo array de pontos vem APENAS de `savedInternal/savedExternal` |
| Formato antigo de firmware (clientes existentes) parar de funcionar | Detecta delimitador `;` vs `,`; o de `,` segue caminho 8/10 colunas idêntico ao atual |
| Telegram mensagens que assumem 2 sensores | Na primeira passagem, ajustar só as strings de fallback "Nenhum dado…"; manter `lastSensorFrame` igual tipo |
| Auto-update quebrado por alteração em package.json/build | NÃO tocar em appId/productId/publish/build.win nem .yml workflows |
