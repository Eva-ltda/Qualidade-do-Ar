import { Thermometer, Droplets, Gauge, Leaf } from 'lucide-react'
import { Header } from './components/Header'
import { NotificationPanel } from './components/NotificationPanel'
import { SensorCard } from './components/SensorCard'
import { VOCGauge } from './components/VOCGauge'
import { StatusPanel } from './components/StatusPanel'
import { HistoryChart } from './components/HistoryChart'
import { SerialPanel } from './components/SerialPanel'
import { Footer } from './components/Footer'
import { useSerial } from './hooks/useSerial'
import { getAirQualityFromVoc, vocToPPM } from './lib/airQuality'
import { formatInt, formatNumber } from './lib/format'
import { useMemo, useState } from 'react'

function EnvironmentSection({
  title,
  temperatureColor,
  values,
}: {
  title: string
  temperatureColor: { icon: string; bar: string }
  values: { temp: number; hum: number; press: number; ppm: number }
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-xs font-medium text-slate-500">BME680</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SensorCard
          title="Temperatura"
          value={formatNumber(values.temp, 1)}
          unit="°C"
          icon={<Thermometer className="h-5 w-5" />}
          iconClassName={temperatureColor.icon}
          barClassName={temperatureColor.bar}
        />
        <SensorCard
          title="Umidade"
          value={formatInt(values.hum)}
          unit="%"
          icon={<Droplets className="h-5 w-5" />}
          iconClassName="text-blue-600"
          barClassName="bg-blue-500"
        />
        <SensorCard
          title="Pressão"
          value={formatInt(values.press)}
          unit="hPa"
          icon={<Gauge className="h-5 w-5" />}
          iconClassName="text-purple-600"
          barClassName="bg-purple-500"
        />
        <SensorCard
          title="PPM"
          value={formatInt(values.ppm)}
          unit="ppm"
          icon={<Leaf className="h-5 w-5" />}
          iconClassName="text-emerald-600"
          barClassName="bg-emerald-500"
        />
      </div>
    </section>
  )
}

function App() {
  const [updateValue, setUpdateValue] = useState(2)
  const [updateUnit, setUpdateUnit] = useState<'seconds' | 'minutes' | 'hours'>('seconds')

  const updateIntervalMs = useMemo(() => {
    const unitMs = updateUnit === 'seconds' ? 1000 : updateUnit === 'minutes' ? 60 * 1000 : 60 * 60 * 1000
    return Math.max(1, updateValue) * unitMs
  }, [updateUnit, updateValue])

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
  } =
    useSerial(updateIntervalMs)

  const vocInternoCorrigido = lastFrame?.vocInternoCorrigido ?? lastFrame?.vocInterno ?? Number.NaN
  const vocExternoCorrigido = lastFrame?.vocExternoCorrigido ?? lastFrame?.vocExterno ?? Number.NaN
  const ppmInterno = vocToPPM(vocInternoCorrigido)
  const ppmExterno = vocToPPM(vocExternoCorrigido)

  const qi = getAirQualityFromVoc(vocInternoCorrigido)
  const qe = getAirQualityFromVoc(vocExternoCorrigido)

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
        lastReceivedAt={lastFrame?.receivedAt}
        lastRaw={lastFrame?.raw}
        updateValue={updateValue}
        onUpdateValueChange={setUpdateValue}
        updateUnit={updateUnit}
        onUpdateUnitChange={setUpdateUnit}
      />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-6">
            <EnvironmentSection
              title="🏠 Ambiente Interno (BME680)"
              temperatureColor={{ icon: 'text-red-600', bar: 'bg-red-500' }}
              values={{
                temp: lastFrame?.tempInterno ?? Number.NaN,
                hum: lastFrame?.humInterno ?? Number.NaN,
                press: lastFrame?.pressInterno ?? Number.NaN,
                ppm: ppmInterno,
              }}
            />
          </div>

          <div className="col-span-12 xl:col-span-6">
            <EnvironmentSection
              title="🌳 Ambiente Externo (BME680)"
              temperatureColor={{ icon: 'text-orange-600', bar: 'bg-orange-500' }}
              values={{
                temp: lastFrame?.tempExterno ?? Number.NaN,
                hum: lastFrame?.humExterno ?? Number.NaN,
                press: lastFrame?.pressExterno ?? Number.NaN,
                ppm: ppmExterno,
              }}
            />
          </div>

          <div className="col-span-12 xl:col-span-6">
            <VOCGauge
              title="Qualidade do Ar Interno"
              vocCalibrado={vocInternoCorrigido}
              quality={qi}
            />
          </div>
          <div className="col-span-12 xl:col-span-6">
            <VOCGauge
              title="Qualidade do Ar Externo"
              vocCalibrado={vocExternoCorrigido}
              quality={qe}
            />
          </div>

          <div className="col-span-12 xl:col-span-8">
            <HistoryChart data={history} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <StatusPanel portPath={status.portPath} status={status} lines={serialLines} onClear={clearSerialLines} />
          </div>

          <div className="col-span-12">
            <NotificationPanel />
          </div>

          <div className="col-span-12">
            <SerialPanel />
          </div>
        </div>

        <Footer />
      </main>
    </div>
  )
}

export default App
