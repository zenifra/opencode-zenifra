import { BASE_URL, MODELS_URL, PROVIDER_ID, parseCatalog } from "./catalog.js"
import { parseOptions } from "./options.js"

const CACHE_KEY = "catalog"

/**
 * Create an OpenCode V2 plugin definition.
 * Dependencies are injectable so lifecycle tests require no network or credentials.
 * Plugin.define is an identity helper; a plain definition avoids runtime dependencies.
 */
export function createPlugin({
  fetch = globalThis.fetch,
  schedule = setInterval,
  cancel = clearInterval,
  logger = console,
} = {}) {
  return {
    id: "zenifra.models",
    async setup(ctx) {
      const options = parseOptions(ctx.options)
      const { refreshIntervalMs, timeoutMs } = options
      let models = []
      let fingerprint = ""
      let stopped = false
      let running = false
      let controller
      try {
        const cached = await ctx.storage.get(CACHE_KEY)
        if (cached) {
          models = parseCatalog(cached, options)
          fingerprint = JSON.stringify(models)
        }
      } catch (error) {
        logger.warn("Zenifra cached inventory is unavailable or invalid", error)
      }

      await ctx.integration.transform((editor) => {
        editor.method.update({ integrationID: PROVIDER_ID, method: { type: "key" } })
        editor.method.update({
          integrationID: PROVIDER_ID,
          method: { type: "env", names: ["ZENIFRA_API_KEY"] },
        })
        editor.update(PROVIDER_ID, (integration) => {
          integration.name = "Zenifra"
        })
      })
      await ctx.provider.transform((editor) => {
        editor.add({
          info: {
            id: PROVIDER_ID,
            name: "Zenifra",
            integrationID: PROVIDER_ID,
            activation: "auto",
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: BASE_URL },
          },
          models,
        })
      })

      async function refresh() {
        if (running || stopped) return
        running = true
        const request = new AbortController()
        controller = request
        const timeout = setTimeout(() => request.abort(), timeoutMs)
        try {
          // Discovery is public: do not send the user's inference credentials.
          const response = await fetch(MODELS_URL, { signal: request.signal })
          if (!response.ok) throw new Error(`Zenifra model discovery: HTTP ${response.status}`)
          const payload = await response.json()
          const next = parseCatalog(payload, options)
          if (stopped) return
          const nextFingerprint = JSON.stringify(next)
          if (nextFingerprint !== fingerprint) {
            const previous = models
            models = next
            try {
              await ctx.provider.reload()
              fingerprint = nextFingerprint
            } catch (error) {
              models = previous
              throw error
            }
          }
          if (stopped) return
          try {
            await ctx.storage.set(CACHE_KEY, payload)
          } catch (error) {
            logger.warn(
              "Zenifra catalog persistence failed; live inventory remains available",
              error,
            )
          }
        } catch (error) {
          if (!stopped)
            logger.warn("Zenifra model discovery failed; retaining last inventory", error)
        } finally {
          clearTimeout(timeout)
          controller = undefined
          running = false
        }
      }

      await refresh()
      const timer = schedule(refresh, refreshIntervalMs)
      timer?.unref?.()
      return () => {
        stopped = true
        cancel(timer)
        controller?.abort()
      }
    },
  }
}

export default createPlugin()
