import { motion } from 'framer-motion'
import { Save, Send } from 'lucide-react'
import { useEffect, useState } from 'react'

const defaultSettings: NotificationSettings = {
  enabled: false,
  phoneNumber: '',
  chatId: undefined,
  heartbeatIntervalMinutes: 60,
  staleTimeoutSeconds: 60,
}

const defaultRuntimeState: NotificationRuntimeState = {
  collectionState: 'aguardando',
}

export function NotificationPanel() {
  const api = (window as unknown as { eva?: Window['eva'] }).eva
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings)
  const [runtimeState, setRuntimeState] = useState<NotificationRuntimeState>(defaultRuntimeState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState<string>('')

  const formatDateTime = (value?: number) => {
    if (!value) return 'Nenhum registro'
    return new Date(value).toLocaleString('pt-BR', { hour12: false })
  }

  const getCollectionLabel = () => {
    if (runtimeState.collectionState === 'coletando') return 'Coleta em andamento'
    if (runtimeState.collectionState === 'parada') return 'Coleta parada'
    return 'Aguardando coleta'
  }

  const getLastSentLabel = () => {
    if (!runtimeState.lastSentAt) return 'Nenhum envio realizado'
    const kindLabels: Record<NonNullable<NotificationRuntimeState['lastSentKind']>, string> = {
      inicio: 'inicio da coleta',
      intervalo: 'intervalo programado',
      parada: 'parada da coleta',
      reativacao: 'coleta ja em andamento',
      teste: 'teste manual',
    }
    const kind = runtimeState.lastSentKind ? kindLabels[runtimeState.lastSentKind] : 'notificacao'
    return `${formatDateTime(runtimeState.lastSentAt)} (${kind})`
  }

  const getLastErrorLabel = () => {
    if (!runtimeState.lastErrorAt) return 'Nenhuma falha registrada'
    const message = runtimeState.lastErrorMessage ? ` - ${runtimeState.lastErrorMessage}` : ''
    return `${formatDateTime(runtimeState.lastErrorAt)}${message}`
  }

  const getNextNotificationLabel = () => {
    if (!settings.chatId) return 'Aguardando vinculacao no Telegram'
    if (runtimeState.nextNotificationAt) return formatDateTime(runtimeState.nextNotificationAt)
    if (runtimeState.collectionState === 'coletando') return 'Aguardando proximo intervalo'
    if (runtimeState.collectionState === 'parada') return 'Aguardando retomada da coleta'
    return 'Aguardando inicio da coleta'
  }

  useEffect(() => {
    if (!api) {
      setLoading(false)
      setFeedback('API de notificacoes indisponivel.')
      return
    }

    api
      .getNotificationSettings()
      .then((loaded) => {
        setSettings(loaded)
      })
      .catch(() => {
        setFeedback('Nao foi possivel carregar as configuracoes de notificacao.')
      })
      .finally(() => {
        setLoading(false)
      })

    api
      .getNotificationRuntimeState()
      .then((state) => {
        setRuntimeState(state)
      })
      .catch(() => {})

    const unsubscribe = api.onNotificationRuntimeState((state) => {
      setRuntimeState(state)
    })
    const unsubscribeSettings = api.onNotificationSettings((nextSettings) => {
      setSettings(nextSettings)
      setFeedback(nextSettings.chatId ? 'Telegram vinculado com sucesso.' : '')
    })

    return () => {
      unsubscribe()
      unsubscribeSettings()
    }
  }, [api])

  const handleSave = async () => {
    if (!api) return

    setSaving(true)
    setFeedback('')
    try {
      const saved = await api.saveNotificationSettings({
        ...settings,
        enabled: Boolean(settings.chatId),
        heartbeatIntervalMinutes: Math.max(1, Number(settings.heartbeatIntervalMinutes) || 60),
        staleTimeoutSeconds: Math.max(5, Number(settings.staleTimeoutSeconds) || 60),
      })
      setSettings(saved)
      setFeedback(saved.enabled ? 'Numero salvo e notificacoes ativas.' : 'Numero salvo. Aguardando vinculacao no Telegram.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar as configuracoes de notificacao.')
    } finally {
      setSaving(false)
    }
  }

  const handleTestNotification = async () => {
    if (!api) return

    setTesting(true)
    setFeedback('')
    try {
      const result = await api.testNotification({
        ...settings,
        enabled: true,
        heartbeatIntervalMinutes: Math.max(1, Number(settings.heartbeatIntervalMinutes) || 60),
        staleTimeoutSeconds: Math.max(5, Number(settings.staleTimeoutSeconds) || 60),
      })

      if (!result.ok) {
        setFeedback(result.error || 'Falha ao enviar notificacao de teste.')
        return
      }

      setFeedback('Notificacao de teste enviada com sucesso.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar notificacao de teste.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200"
    >
      <div>
        <div className="text-sm font-semibold text-slate-900">Notificacoes no Celular</div>
        <div className="mt-1 text-xs text-slate-500">Canal configurado: Telegram</div>
      </div>

      <div className="mt-4 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="text-[11px] font-medium text-slate-500">Numero de telefone</div>
          <input
            type="text"
            value={settings.phoneNumber}
            onChange={(e) => setSettings((prev) => ({ ...prev, phoneNumber: e.target.value }))}
            placeholder="+5511999999999"
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500">Intervalo da notificacao</div>
          <div className="mt-1 flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3">
            <input
              type="number"
              min={1}
              value={settings.heartbeatIntervalMinutes}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, heartbeatIntervalMinutes: Number(e.target.value) || 1 }))
              }
              className="w-20 bg-transparent text-sm font-semibold text-slate-900 outline-none"
            />
            <span className="text-sm text-slate-500">minutos</span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500">Considerar parada apos</div>
          <div className="mt-1 flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3">
            <input
              type="number"
              min={5}
              value={settings.staleTimeoutSeconds}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, staleTimeoutSeconds: Number(e.target.value) || 60 }))
              }
              className="w-20 bg-transparent text-sm font-semibold text-slate-900 outline-none"
            />
            <span className="text-sm text-slate-500">segundos</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 ring-1 ring-slate-200">
        <div>O app envia notificacoes no Telegram quando a coleta iniciar, continuar ativa e quando ficar sem dados.</div>
        <div className="mt-1">Para vincular, no Telegram envie: /registrar EVA</div>
        <div className="mt-1">Opcional: voce tambem pode vincular compartilhando seu contato (telefone) com o bot.</div>
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          Aviso: se o dashboard estiver fechado ou sem conexao com a internet, o bot nao consegue emitir notificacoes.
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Status da coleta</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{getCollectionLabel()}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Vinculacao</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{settings.chatId ? 'Vinculado' : 'Nao vinculado'}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Ultimo envio</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{getLastSentLabel()}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Ultima falha</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{getLastErrorLabel()}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="text-[11px] font-medium text-slate-500">Proxima notificacao prevista</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{getNextNotificationLabel()}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {loading ? 'Carregando configuracoes...' : feedback || 'Informe os dados e clique em salvar.'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTestNotification}
            disabled={loading || saving || testing}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            <Send className="h-4 w-4" />
            {testing ? 'Enviando teste...' : 'Enviar teste Telegram'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || testing}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar notificacoes'}
          </button>
        </div>
      </div>
    </motion.section>
  )
}
