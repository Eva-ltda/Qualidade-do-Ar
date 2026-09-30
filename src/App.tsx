import { Header } from './components/Header'
import { NotificationPanel } from './components/NotificationPanel'
import { VOCGauge } from './components/VOCGauge'
import { StatusPanel } from './components/StatusPanel'
import { HistoryChart } from './components/HistoryChart'
import { SerialPanel } from './components/SerialPanel'
import { Footer } from './components/Footer'
import { LocationSelector } from './components/LocationSelector'
import { MeasurementPanel } from './components/MeasurementPanel'
import { useSerial } from './hooks/useSerial'
import { getAirQualityFromVoc } from './lib/airQuality'
import { useEffect, useMemo, useState } from 'react'

function App() {
  const api = window.eva
  const [updateValue, setUpdateValue] = useState(4)
  const [updateUnit, setUpdateUnit] = useState<'seconds' | 'minutes' | 'hours'>('seconds')
  const [printFrameOverride, setPrintFrameOverride] = useState<SensorFrame | undefined>()
  const [lastInternalFrame, setLastInternalFrame] = useState<SensorFrame | null>(null)
  const [lastExternalFrame, setLastExternalFrame] = useState<SensorFrame | null>(null)

  const {
    ports,
    selectedPort,
    setSelectedPort,
    status,
    lastFrame,
    history,
    serialLines,
    clearSerialLines,
    refreshPorts,
    connect,
    exportCsv,
    backupCsv,
    currentLocation,
    confirmedLocation,
    arduinoState,
    setLocation,
    measurementState,
    stabilizationEndsAt,
    now,
  } = useSerial()

  useEffect(() => {
    if (!lastFrame) return
    const loc = lastFrame.location === 'EXTERNO' ? 'EXTERNO' : 'INTERNO'
    if (measurementState === 'stabilizing') return
    queueMicrotask(() => {
      if (loc === 'INTERNO') {
        setLastInternalFrame(lastFrame)
      } else {
        setLastExternalFrame(lastFrame)
      }
    })
  }, [lastFrame, measurementState])

  useEffect(() => {
    if (!api) return

    const unsubscribePrepare = api.onPrintCaptureRequest((frame) => {
      setPrintFrameOverride(frame)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          api.notifyPrintCaptureReady()
        })
      })
    })

    const unsubscribeFinished = api.onPrintCaptureFinished(() => {
      setPrintFrameOverride(undefined)
    })

    return () => {
      unsubscribePrepare()
      unsubscribeFinished()
    }
  }, [api])

  const displayFrame = printFrameOverride ?? lastFrame

  const frameVoc = (frame: SensorFrame | null | undefined) =>
    frame && Number.isFinite(frame.vocCorrigido ?? NaN)
      ? frame!.vocCorrigido
      : (frame?.voc ?? Number.NaN)

  const vocInternal = frameVoc(lastInternalFrame)
  const vocExternal = frameVoc(lastExternalFrame)
  const qInternal = Number.isFinite(vocInternal) ? getAirQualityFromVoc(vocInternal) : null
  const qExternal = Number.isFinite(vocExternal) ? getAirQualityFromVoc(vocExternal) : null

  const displayHistory = useMemo(() => {
    if (!printFrameOverride) return history
    const current = history[history.length - 1]
    if (current?.ts === printFrameOverride.receivedAt) return history
    const fVoc = Number.isFinite(printFrameOverride.vocCorrigido)
      ? printFrameOverride.vocCorrigido
      : printFrameOverride.voc
    const qFrame = getAirQualityFromVoc(fVoc)
    const t = new Date(printFrameOverride.receivedAt).toLocaleTimeString('pt-BR', { hour12: false })
    const isInternal = printFrameOverride.location === 'INTERNO'
    return [
      ...history,
      {
        t,
        ts: printFrameOverride.receivedAt,
        interno: isInternal ? qFrame.percent : undefined,
        externo: !isInternal ? qFrame.percent : undefined,
      },
    ].slice(-200)
  }, [history, printFrameOverride])

  return (
    <div className="min-h-full">
      <Header
        ports={ports}
        selectedPort={selectedPort}
        onSelectPort={setSelectedPort}
        onRefreshPorts={refreshPorts}
        onBackup={() => backupCsv()}
        onExport={() => exportCsv()}
        onConnect={connect}
        status={status}
        lastReceivedAt={displayFrame?.receivedAt}
        lastRaw={displayFrame?.raw}
        currentLocation={currentLocation}
        arduinoState={arduinoState}
        confirmedLocation={confirmedLocation}
        updateValue={updateValue}
        onUpdateValueChange={setUpdateValue}
        updateUnit={updateUnit}
        onUpdateUnitChange={setUpdateUnit}
      />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-4">
            <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Local da medição
              </div>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Onde está o sensor BME680 agora?
              </h2>
              <p className="mt-2 text-xs text-slate-500">
                Selecione o ambiente. Ao trocar, inicia automaticamente a estabilização de 120 segundos.
              </p>
              <div className="mt-4">
                <LocationSelector
                  current={currentLocation}
                  onChange={setLocation}
                  arduinoState={arduinoState}
                  confirmedLocation={confirmedLocation}
                  disabled={arduinoState === 'AGUARDANDO_ACK' || status.state !== 'connected'}
                />
              </div>
            </section>
          </div>

          <div className="col-span-12 xl:col-span-8">
            <MeasurementPanel
              location={currentLocation}
              lastFrame={lastFrame}
              measurementState={measurementState}
              stabilizationEndsAt={stabilizationEndsAt}
              now={now}
              arduinoState={arduinoState}
              confirmedLocation={confirmedLocation}
            />
          </div>

          <div className="col-span-12 xl:col-span-6">
            <VOCGauge
              title="Medição Atual Local: Interno"
              subtitle={
                lastInternalFrame
                  ? new Date(lastInternalFrame.receivedAt).toLocaleString('pt-BR', { hour12: false })
                  : 'Aguardando primeira coleta do ambiente interno'
              }
              vocCalibrado={vocInternal}
              quality={qInternal ?? { label: 'Aguardando', percent: 0 }}
            />
          </div>
          <div className="col-span-12 xl:col-span-6">
            <VOCGauge
              title="Medição Atual Local: Externo"
              subtitle={
                lastExternalFrame
                  ? new Date(lastExternalFrame.receivedAt).toLocaleString('pt-BR', { hour12: false })
                  : 'Aguardando primeira coleta do ambiente externo'
              }
              vocCalibrado={vocExternal}
              quality={qExternal ?? { label: 'Aguardando', percent: 0 }}
            />
          </div>

          <div className="col-span-12">
            <HistoryChart data={displayHistory} dualMode={true} />
          </div>

          <div className="col-span-12 xl:col-span-8">
            <SerialPanel />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <StatusPanel portPath={status.portPath} status={status} lines={serialLines} onClear={clearSerialLines} />
          </div>

          <div className="col-span-12">
            <NotificationPanel currentLocation={currentLocation} />
          </div>
        </div>

        <Footer />
      </main>
    </div>
  )
}

export default App
