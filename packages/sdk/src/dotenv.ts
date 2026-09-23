export interface DotenvApi {
  parseDotenv(text: string): Record<string, string>
  renderDotenv(values: Record<string, string | undefined>): string
  resolveReferences(values: Record<string, string>, options?: ResolveReferencesOptions): Record<string, string>
}

export interface ResolveReferencesOptions {
  prefix?: string
  suffix?: string
  maxDepth?: number
}

const MOBILE_FILE_KEYS = [
  'GOOGLE_SERVICES_JSON',
  'GOOGLE_SERVICE_INFO_PLIST',
  'RELEASE_KEYSTORE',
]

const isMobileFileKey = (key: string): boolean =>
  MOBILE_FILE_KEYS.includes(key) ||
  key.toLowerCase().endsWith('_base64') ||
  /google-services|googleservice-info|keystore|plist/i.test(key)

export const parseDotenv = (text: string): Record<string, string> => {
  const result: Record<string, string> = {}

  for (let line of text.split('\n')) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue

    const index = line.indexOf('=')
    if (index === -1) continue

    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

export const renderDotenv = (values: Record<string, string | undefined>): string => {
  const lines: string[] = []

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue

    if (isMobileFileKey(key) || value === '') {
      lines.push(`${key}=${value}`)
      continue
    }

    const needsQuotes =
      value.includes(' ') ||
      value.includes('#') ||
      value.includes('\n') ||
      value.includes('"') ||
      value.includes("'")

    if (needsQuotes) {
      lines.push(`${key}="${value.replace(/"/g, '\\"')}"`)
    } else {
      lines.push(`${key}=${value}`)
    }
  }

  return lines.join('\n')
}

export const resolveReferences = (
  values: Record<string, string>,
  options: ResolveReferencesOptions = {}
): Record<string, string> => {
  const prefix = options.prefix ?? '${'
  const suffix = options.suffix ?? '}'
  const maxDepth = options.maxDepth ?? 10

  const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const pattern = new RegExp(`${escapeRegex(prefix)}(.*?)${escapeRegex(suffix)}`, 'g')

  const resolved: Record<string, string> = { ...values }

  const resolveOne = (value: string, stack: Set<string>): string => {
    return value.replace(pattern, (match, refKey: string) => {
      const trimmed = refKey.trim()
      if (stack.has(trimmed)) return match

      const refValue = resolved[trimmed]
      if (refValue === undefined) return match

      stack.add(trimmed)
      const inner = resolveOne(refValue, stack)
      stack.delete(trimmed)
      return inner
    })
  }

  for (let i = 0; i < maxDepth; i++) {
    let changed = false

    for (const [key, value] of Object.entries(resolved)) {
      const stack = new Set<string>([key])
      const next = resolveOne(value, stack)
      if (next !== resolved[key]) {
        resolved[key] = next
        changed = true
      }
    }

    if (!changed) break
  }

  return resolved
}

export const createDotenv = (): DotenvApi => ({
  parseDotenv,
  renderDotenv,
  resolveReferences,
})
