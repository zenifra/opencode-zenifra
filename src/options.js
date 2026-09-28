export const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000
export const DEFAULT_TIMEOUT_MS = 15 * 1000

const MAX_TIMER_MS = 2_147_483_647
const OPTION_NAMES = new Set(["refreshIntervalMs", "timeoutMs", "pricingCurrency"])

/** Validate timer bounds shared by Node.js and Bun. */
function parseDuration(value, fallback, name) {
  if (value === undefined) return fallback

  if (!Number.isSafeInteger(value) || value < 1000 || value > MAX_TIMER_MS) {
    throw new TypeError(`${name} must be an integer between 1000 and ${MAX_TIMER_MS} milliseconds`)
  }

  return value
}

/**
 * Validate configuration once, before registering any runtime resources.
 * @param {unknown} input
 * @returns {{ refreshIntervalMs: number, timeoutMs: number, pricingCurrency?: "USD" }}
 */
export function parseOptions(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Zenifra plugin options must be an object")
  }

  for (const name of Object.keys(input)) {
    if (!OPTION_NAMES.has(name)) throw new TypeError(`Unknown Zenifra plugin option: ${name}`)
  }

  if (input.pricingCurrency !== undefined && input.pricingCurrency !== "USD") {
    throw new TypeError(
      "pricingCurrency must be omitted or set to USD after confirming the API currency",
    )
  }

  return Object.freeze({
    refreshIntervalMs: parseDuration(
      input.refreshIntervalMs,
      DEFAULT_REFRESH_INTERVAL_MS,
      "refreshIntervalMs",
    ),
    timeoutMs: parseDuration(input.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs"),
    pricingCurrency: input.pricingCurrency,
  })
}
