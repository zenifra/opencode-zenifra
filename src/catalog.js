export const PROVIDER_ID = "zenifra"
export const BASE_URL = "https://ai.zenifra.com/v1"
export const MODELS_URL = `${BASE_URL}/models`

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function strings(value, fallback, field) {
  if (value === undefined) return fallback
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry.trim() || entry !== entry.trim())
  ) {
    throw new Error(`Invalid Zenifra ${field}`)
  }
  return [...new Set(value)]
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

// The API does not declare a currency. OpenCode's cost schema requires USD.
// Only import prices when the publisher/operator explicitly confirms USD.
function prices(pricing, currency) {
  if (currency !== "USD" || pricing === undefined) return []
  if (!isRecord(pricing)) throw new Error("Invalid Zenifra pricing")
  if (pricing.unit !== "per_million_tokens") return []
  const rows = pricing.context_tiers ?? [pricing]
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Invalid Zenifra pricing tiers")
  return rows.map((row, index) => {
    if (!isRecord(row)) throw new Error("Invalid Zenifra pricing tier")
    const amounts = [row.input, row.output, row.cache_read_input ?? 0, row.cache_write_input ?? 0]
    if (
      amounts.some((amount) => typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
    ) {
      throw new Error("Invalid Zenifra pricing")
    }
    if (pricing.context_tiers && index === 0 && row.min_input_tokens !== 0) {
      throw new Error("Zenifra pricing tiers must start at zero input tokens")
    }
    if (
      index > 0 &&
      (!positiveInteger(row.min_input_tokens) ||
        row.min_input_tokens <= rows[index - 1].min_input_tokens)
    ) {
      throw new Error("Invalid Zenifra pricing threshold")
    }
    return {
      ...(index > 0 ? { tier: { type: "context", size: row.min_input_tokens } } : {}),
      input: amounts[0],
      output: amounts[1],
      cache: { read: amounts[2], write: amounts[3] },
    }
  })
}

/**
 * Convert the public Zenifra inventory to OpenCode model definitions.
 * Reject an invalid snapshot in full so refresh can retain the last valid catalog.
 * @param {unknown} payload
 * @param {{ pricingCurrency?: "USD" }} options
 */
export function parseCatalog(payload, { pricingCurrency } = {}) {
  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("Zenifra returned an empty or invalid model inventory")
  }
  const ids = new Set()
  const models = []
  for (const item of payload.data) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      item.id !== item.id.trim() ||
      item.id.includes("#")
    ) {
      throw new Error("Invalid Zenifra model ID")
    }
    // This plugin uses Chat Completions, not embedding-only or Responses-only models.
    if (item.supported_operations !== undefined) {
      const operations = strings(item.supported_operations, [], "supported operations")
      if (!operations.includes("/v1/chat/completions")) continue
    }
    const id = item.id.replace(/^zenifra\//, "")
    if (
      !id ||
      ids.has(id) ||
      !positiveInteger(item.context_length) ||
      !positiveInteger(item.max_output_tokens)
    ) {
      throw new Error("Invalid or duplicate Zenifra model metadata")
    }
    ids.add(id)
    if (item.capabilities !== undefined && !isRecord(item.capabilities)) {
      throw new Error(`Invalid Zenifra capabilities for ${id}`)
    }
    const reasoning = item.capabilities?.reasoning
    if (reasoning !== undefined && !isRecord(reasoning)) {
      throw new Error(`Invalid Zenifra reasoning metadata for ${id}`)
    }
    const efforts = strings(reasoning?.effort_levels, [], "reasoning efforts")
    if (efforts.some((effort) => effort.includes("#") || effort.includes("/"))) {
      throw new Error(`Invalid Zenifra reasoning variant for ${id}`)
    }
    const capabilities = {
      tools: item.capabilities?.function_calling === true,
      input: strings(
        item.input_modalities,
        item.capabilities?.vision ? ["text", "image"] : ["text"],
        "input modalities",
      ),
      output: strings(item.output_modalities, ["text"], "output modalities"),
    }
    if (capabilities.input.length === 0 || capabilities.output.length === 0) {
      throw new Error(`Zenifra model ${id} must declare input and output modalities`)
    }
    models.push({
      id,
      modelID: item.id,
      providerID: PROVIDER_ID,
      name: typeof item.name === "string" && item.name ? item.name : id,
      enabled: true,
      status: "active",
      time: { released: 0 },
      limit: { context: item.context_length, output: item.max_output_tokens },
      capabilities,
      ...(reasoning?.supported ? { compatibility: { reasoningField: "reasoning_content" } } : {}),
      variants: efforts.map((effort) => ({ id: effort, body: { reasoning_effort: effort } })),
      cost: prices(item.pricing, pricingCurrency),
    })
  }
  if (models.length === 0) throw new Error("Zenifra returned no supported chat models")
  // Reordering the API response alone should not trigger a provider reload.
  return models.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}
