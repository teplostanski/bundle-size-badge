const UNITS = ['B', 'kB', 'MB', 'GB'] as const

/** Pretty-print byte counts the way README badges usually do. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`Invalid byte count: ${bytes}`)
  }

  if (bytes < 1000) {
    return `${bytes} B`
  }

  let value = bytes
  let unitIndex = 0

  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000
    unitIndex += 1
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${UNITS[unitIndex]}`
}

export const isPrerelease = (version: string): boolean =>
  version.includes('-')
