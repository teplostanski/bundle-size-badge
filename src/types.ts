export type SizeReport = {
  readonly schemaVersion: 1
  readonly name: string
  readonly version: string
  readonly entry: string
  readonly bytes: {
    readonly raw: number
    readonly gzip: number
    readonly brotli: number
  }
  readonly bundler: {
    readonly name: 'esbuild'
    readonly version: string
  }
  readonly measuredAt: string
  readonly gitSha: string | null
  readonly prerelease: boolean
}

export type CacheMeta = {
  readonly schemaVersion: 1
  readonly packageName: string
  readonly updatedAt: string
  readonly versions: readonly string[]
}

export type MeasureOptions = {
  readonly packageDir: string
  readonly entryOverride?: string
  readonly external?: readonly string[]
  readonly gitSha?: string | null
}
