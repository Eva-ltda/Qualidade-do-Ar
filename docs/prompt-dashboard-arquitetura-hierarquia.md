# Prompt de Referência — EVA Dashboard Qualidade do Ar
# Use este arquivo como entrada (system prompt ou primeira mensagem) para o GPT/Trae
# entender TODA a arquitetura, linguagens, hierarquia de componentes e regras
# de negócio DO DASHBOARD antes de qualquer alteração.
#
# Objetivo: NÃO recrie o projeto do zero. Evolua incrementalmente o que já existe.
# NÃO use dados simulados. Os dados vêm SEMPRE do Arduino via serial.

---

## 1. STACK TECNOLÓGICA (Linguagens & Ferramentas)

| Camada          | Tecnologia                          | Versão / Detalhe                                   |
|-----------------|-------------------------------------|----------------------------------------------------|
| Desktop Shell   | **Electron 42**                     | `dist-electron/main.cjs` + `preload.cjs`           |
| Renderer (UI)   | **React 19 + Vite 8**               | TypeScript estrito, `src/`                         |
| Estilos         | **Tailwind CSS 3.4**                | `tailwind.config.cjs`, classes utilitárias         |
| Animações       | **Framer Motion 12**                | `motion.*` + `useMotionValue`                      |
| Gráficos        | **Recharts 3**                      | `LineChart`, `ResponsiveContainer`                 |
| Ícones          | **Lucide React**                    | APENAS ícones daqui. Não importar outra lib.      |
| Serial          | **serialport 13** + parser-readline | Apenas no Electron MAIN, NÃO no renderer           |
| Auto-update     | **electron-updater 6**              | GitHub Releases → Eva-ltda/Qualidade-do-Ar         |
| Build           | **tsup 8** (electron) + electron-builder 26 | Portable + NSIS (Windows)          |
| Linguagem       | **TypeScript ~6.0** (estrito)       | `type: module` no package.json                     |
| Idioma UI       | **Português Brasileiro (pt-BR)**    | TUDO na UI em pt-BR. Sem inglês visível.           |

---

## 2. ARQUITETURA GERAL (3 processos — separação ESTREITA)

```
┌──────────────────────────────────────────────────────────────┐
│  Electron MAIN (Node.js)  —  electron/main.ts                │
│  · Acesso FS, serialport, Telegram, dialog, IPC Main         │
│  · ipcMain.handle(...) + broadcast(channel) p/ todas janelas │
│  · Classes: SerialManager / settings / autoUpdater           │
└───────────────┬──────────────────────────────────────────────┘
                │  IPC via contextBridge (preload) — SEM nodeIntegration
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Preload  —  electron/preload.ts  →  window.eva              │
│  · Whitelist de APIs. Tudo que o renderer usa vem daqui.     │
└───────────────┬──────────────────────────────────────────────┘
                │  React lê window.eva no hook useSerial()
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Renderer (React)  —  src/                                   │
│  · NÃO usa fs / serialport / electron diretamente.           │
│  · Estado via useState + useRef. NÃO usa Redux/Zustand.      │
└──────────────────────────────────────────────────────────────┘
```

### Fluxo de dados OFICIAL (não quebre):
```
Arduino (CSV) → USB → SerialPort (main) → ReadlineParser
  → SerialManager.parseFrame() → emit('frame', SensorFrame)
  → main.ts broadcast('serial:frame', frame)
  → preload → renderer window.eva.onFrame(callback)
  → useSerial.ts acumula → setLastFrame / setHistory
  → App.tsx calcula ppmInterno/ppmExterno, qi, qe → props p/ filhos
  → Componentes puros (VOCGauge, HistoryChart etc.) renderizam
```

---

## 3. HIERARQUIA DE COMPONENTES (src/)

```
src/
├─ main.tsx           ← ReactDOM.createRoot
├─ App.tsx            ← RAIZ. Layout grid 12 colunas (max-w-[1400px])
├─ index.css          ← Tailwind + variáveis custom (shadow-card etc.)
├─ types/eva.d.ts     ← Tipos globais: SensorFrame, Window['eva']
├─ lib/
│  ├─ airQuality.ts   ← REGRA DE NEGÓCIO: vocToPPM, getAirQualityFromVoc, getQualityTone
│  └─ format.ts       ← formatNumber, formatInt, formatTime — pt-BR
├─ hooks/
│  └─ useSerial.ts    ← HOOK CENTRAL. Serial, histórico, CSV export/backup.
└─ components/
   ├─ Header.tsx              (sticky top, logo, relógio, COM, Backup/Exportar)
   ├─ ConnectionStatus.tsx    (chip: Conectado / Conectando / Erro / Desconectado)
   ├─ SensorCard.tsx          (card reutilizável com framer-motion + barra inf.)
   ├─ VOCGauge.tsx            (SVG circular + legenda 5 faixas de ppm)
   ├─ HistoryChart.tsx        (recharts LineChart: interno vs externo, 30 pts)
   ├─ StatusPanel.tsx         (monitor serial verde em fundo preto, auto-scroll)
   ├─ NotificationPanel.tsx   (Telegram: settings, runtime state, salvar/testar)
   ├─ SerialPanel.tsx         (documentação formato CSV do Arduino, 8-10 col)
   └─ Footer.tsx              (uma linha)
```

### EnvironmentSection
É um **SUBCOMPONENTE DENTRO DE App.tsx** (arquivo único, não um `.tsx` separado).
Recebe `title`, `temperatureColor`, `values` e renderiza 4 `<SensorCard>`:
Temperatura °C · Umidade % · Pressão hPa · PPM

### Layout grid col-12 do App.tsx
```
Header [sticky, 12 col, fora do main com padding px-6 py-6]

main (max-w-[1400px])
├─ Linha 1 ─ Ambiente Interno (6 xl) | Ambiente Externo (6 xl)
├─ Linha 2 ─ VOCGauge Interno   (6 xl) | VOCGauge Externo   (6 xl)
├─ Linha 3 ─ HistoryChart       (8 xl) | StatusPanel        (4 xl)
├─ Linha 4 ─ NotificationPanel  (12 col)
└─ Linha 5 ─ SerialPanel        (12 col)

Footer
```

---

## 4. REGRAS DE NEGÓCIO (src/lib/airQuality.ts — FONTE DA VERDADE)

### 4.1 Tabela VOC (KΩ) → PPM (interpolação linear)
```
VOC:   10 → 370 ppm     20 → 274     30 → 203     40 → 150
       50 → 112         60 → 83      70 → 61      80 → 45
      100 → 25
Abaixo de 10 ou acima de 100: extrapola nos dois extremos.
```

### 4.2 Faixas PPM → Label + %
```
0–65     → Excelente   (100–81%)   stroke/text: emerald
66–150   → Boa         (80–61%)    stroke/text: green
151–300  → Moderada    (60–41%)    stroke/text: amber
301–500  → Ruim        (40–21%)    stroke/text: orange
>500     → Muito Ruim  (20–0%)     stroke/text: red
```

### 4.3 Formato Serial Arduino (SerialManager.parseFrame)
```
8 campos (legado):   tempIn,humIn,pressIn,vocIn,tempEx,humEx,pressEx,vocEx
10 campos (atual):   tempIn,humIn,pressIn,vocInREAL,vocInCORR,
                     tempEx,humEx,pressEx,vocExREAL,vocExCORR
Se tem 10 → usa vocInternoCorrigido/vocExternoCorrigido.
Se 8   → usa o valor único.
```

### 4.4 CSV export/backup (useSerial.buildCsvTextAsync)
- **Delimitador:** `;` (ponto-e-vírgula)
- **1ª linha:** `sep=;` (Excel pt-BR reconhece)
- **Decimais:** vírgula (`12,5`), inteiros arredondados
- **Timestamp:** ISO `2026-09-30T12:00:00.000Z`
- **Backup (com metadata):** cabeçalho com tipo, primeiro/último dado, total_registros

---

## 5. TIPOS GLOBAIS (electron/serial/types.ts + src/types/eva.d.ts)

```ts
// ===== SENSOR =====
type SensorFrame = {
  tempInterno, humInterno, pressInterno: number
  vocInterno, vocInternoReal, vocInternoCorrigido: number
  tempExterno, humExterno, pressExterno: number
  vocExterno, vocExternoReal, vocExternoCorrigido: number
  raw: string
  receivedAt: number   // Date.now() do momento do recebimento
}

type ConnectionStatus = {
  state: 'connecting' | 'connected' | 'disconnected' | 'error'
  portPath?: string
  error?: string
  lastReceivedAt?: number
}

// ===== NOTIFICAÇÃO TELEGRAM =====
type NotificationSettings = {
  enabled: boolean
  phoneNumber: string
  chatId?: string | number
  chatIds?: Array<string | number>
  chatIntervals?: Record<string, number>
  chatBackupIntervals?: Record<string, number>
  heartbeatIntervalMinutes: number   // 1..60
  staleTimeoutSeconds: number        // >=5, default 60
}

type NotificationRuntimeState = {
  collectionState: 'aguardando' | 'coletando' | 'parada'
  lastSentAt?: number
  lastSentKind?: 'inicio' | 'intervalo' | 'parada' | 'reativacao' | 'teste'
  lastErrorAt?: number
  lastErrorMessage?: string
  nextNotificationAt?: number
}
```

---

## 6. window.eva — API pública (3 pontos de alteração SEMPRE juntos)

**Quando adicionar um canal novo:**
1. `electron/main.ts` → `ipcMain.handle('canal', fn)` OU `broadcast('canal', payload)`
2. `electron/preload.ts` → expor via `contextBridge.exposeInMainWorld('eva', {...})`
3. `src/types/eva.d.ts` → tipar `eva` dentro de `interface Window`

### Handlers existentes (invoke):
```
serial:listPorts                → SerialPortInfo[]
serial:getStatus                → ConnectionStatus
serial:getLastPort              → string | undefined
serial:connect    (path)        → true
serial:disconnect               → true
notifications:getSettings       → NotificationSettings
notifications:getRuntimeState   → NotificationRuntimeState
notifications:saveSettings      (next)  → NotificationSettings
notifications:testNotification  (next)  → {ok, error?}
data:exportCsv    (csvText)     → {ok, filePath?, canceled?}
data:backupCsv    (csvText)     → {ok, filePath?, canceled?}
```

### Listeners existentes (on → retorna unsubscribe fn):
```
serial:status          (ConnectionStatus)
serial:frame           (SensorFrame)
serial:rawLine         ({text, receivedAt})
notifications:settings
notifications:runtimeState
dashboard:prepare-print
dashboard:finish-print
```

### Sinais renderer → main:
```
dashboard:print-ready   (avisa que frame override foi renderizado p/ captura)
```

---

## 7. PADRÕES DE UI/UX E CÓDIGO

### Tailwind — padrões SEMPRE usados
- **Card container:** `rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200`
- **Título card:** `text-sm font-semibold text-slate-900`
- **Subtítulo:** `text-xs text-slate-500`
- **Valor grande:** `text-2xl font-semibold tracking-tight text-slate-900` + unidade `text-xs font-semibold text-slate-500`
- **Input:** `ring-1 ring-slate-200 rounded-xl h-10`, `outline-none`, `focus:ring-2 focus:ring-slate-900/20`
- **Botão primário (ação ok):** `bg-emerald-600 hover:bg-emerald-500` (Backup, Enviar teste)
- **Botão neutro (ação geral):** `bg-slate-900 hover:bg-slate-800` (Exportar, Salvar)
- **Fundo da janela:** `#f6f7fb` (setado em BrowserWindow backgroundColor + CSS)
- **Animação entrada:** framer-motion `initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.35 }}`

### Convenções de código
- **Export nomeado:** `export function MeuComponente() {...}`
- **Props tipadas:** `type Props = {...}` antes do componente
- **NÃO usar `any`.** Para window: `(window as unknown as {eva?: Window['eva']}).eva`
- **Datas/horários:** `new Date(x).toLocaleString('pt-BR', {hour12:false})` SEMPRE
- **Números:** `formatNumber(n, 1)` / `formatInt(n)` de `lib/format.ts` (pt-BR, vírgula)
- **NÃO adicionar comentários no código** a menos que usuário peça explicitamente.
- **NÃO recriar componentes funcionais do zero.** Evolua os existentes.

---

## 8. ARQUIVOS-CHAVE PARA NAVEGAR

| Arquivo | Responsabilidade |
|---------|-----------------|
| electron/main.ts | BrowserWindow, IPC, Telegram BOT, autoUpdater, ciclo de notificações (início/intervalo/parada/reativação/backup), CSV automático |
| electron/serial/SerialManager.ts | Porta serial: reconectar 1.5s, stale timeout 6.5s, parseFrame CSV 8/10 colunas |
| electron/preload.ts | contextBridge → window.eva |
| electron/settings.ts | Persistência userData JSON (notificações, lastPortPath) |
| src/App.tsx | Composição do layout. Tudo passa por aqui. |
| src/hooks/useSerial.ts | Estado serial, histórico 30 pontos, build CSV, export/backup |
| src/lib/airQuality.ts | Tabela VOC→PPM e 5 faixas (fonte da verdade) |
| src/components/VOCGauge.tsx | SVG circular animado + legenda de 5 faixas |
| src/components/Header.tsx | Logo com canvas (remove preto próximo), COM, Backup/Exportar |
| src/components/NotificationPanel.tsx | Grid 3 col md → staleTimeout, 4 status cards xl, salvar/testar |
| package.json scripts | dev · build · build:win · typecheck · lint · gen:icon · build:renderer · build:electron |

---

## 9. CHECKLIST OBRIGATÓRIO ANTES DE QUALQUER ALTERAÇÃO

1. **Quebra o fluxo serial → main → preload → useSerial → App?** Se sim, NÃO faça.
2. **SensorFrame continua consistente** entre electron/types, eva.d.ts, App, useSerial?
3. **`airQuality.ts` continua sendo a ÚNICA fonte** de VOC→PPM→faixa?
4. **Estou usando as libs já instaladas** (tailwind, lucide, framer-motion, recharts)?
5. **Textos em pt-BR,** datas `pt-BR hour12:false`, números pt-BR com vírgula?
6. **Separação main/renderer:** serial/Telegram/fs → NÃO vai pro renderer React.
7. **CSV mantém `sep=;`, delimitador `;`,** decimais com vírgula?
8. **Estou inventando um arquivo novo?** Prefira editar os existentes.

---

## 10. COMANDOS PARA RODAR (PowerShell Windows)

```powershell
# Dev (Vite + tsup watch + Electron) — contorna ExecutionPolicy
cd d:\PAT\VOC
D:\npm.cmd run dev

# Alternativa (bypass na policy)
powershell -ExecutionPolicy Bypass -Command "npm run dev"

# Build instalador Windows
D:\npm.cmd run build:win

# Typecheck + lint
D:\npm.cmd run typecheck
D:\npm.cmd run lint
```

**Regra ExecutionPolicy:** se quiser `npm run dev` direto sem contornos, execute
uma vez como Administrador:
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
