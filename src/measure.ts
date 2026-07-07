import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import path from 'node:path'
import { build, version as esbuildVersion } from 'esbuild'
import { isPrerelease } from './format.js'
import { resolvePackageEntry } from './resolve-entry.js'
import type { MeasureOptions, SizeReport } from './types.js'

const compress = (buffer: Buffer) => ({
  raw: buffer.byteLength,
  gzip: gzipSync(buffer, { level: 9 }).byteLength,
  brotli: brotliCompressSync(buffer, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
    },
  }).byteLength,
})

/**
 * Bundle the package entry with esbuild (minified), then report raw/gzip/brotli.
 * Dependencies are bundled by default, closer to Bundlephobia's "import cost".
 */
export const measurePackageSize = async (
  options: MeasureOptions,
): Promise<SizeReport> => {
  const resolved = await resolvePackageEntry(
    options.packageDir,
    options.entryOverride,
  )

  const result = await build({
    absWorkingDir: resolved.packageDir,
    entryPoints: [resolved.entry],
    bundle: true,
    minify: true,
    write: false,
    platform: 'neutral',
    format: 'esm',
    target: 'es2020',
    logLevel: 'silent',
    external: options.external ? [...options.external] : [],
    // Avoid pulling node built-ins into browser-ish packages accidentally.
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
  })

  const output = result.outputFiles[0]
  if (!output) {
    throw new Error('esbuild produced no output')
  }

  const bytes = compress(Buffer.from(output.contents))

  return {
    schemaVersion: 1,
    name: resolved.name,
    version: resolved.version,
    entry: path.relative(resolved.packageDir, resolved.entry) || resolved.entry,
    bytes,
    bundler: {
      name: 'esbuild',
      version: esbuildVersion,
    },
    measuredAt: new Date().toISOString(),
    gitSha: options.gitSha ?? null,
    prerelease: isPrerelease(resolved.version),
  }
}
