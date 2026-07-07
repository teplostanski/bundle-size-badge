import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { formatBytes } from './format.js'
import { measurePackageSize } from './measure.js'
import { renderSizeBadges } from './badge.js'

/**
 * Local helper: measure a package without touching git.
 * Usage: npm run measure -- ./path/to/package
 */
const main = async () => {
  const packageDir = path.resolve(process.argv[2] || '.')
  const report = await measurePackageSize({ packageDir })
  const badges = renderSizeBadges(report)

  console.log(JSON.stringify(report, null, 2))
  console.log(
    `\n${report.name}@${report.version}: ` +
      `${formatBytes(report.bytes.raw)} min / ` +
      `${formatBytes(report.bytes.gzip)} gzip / ` +
      `${formatBytes(report.bytes.brotli)} brotli`,
  )

  if (process.argv.includes('--write-badge')) {
    const outDir = path.resolve('test/artifacts')
    await mkdir(outDir, { recursive: true })
    const out = path.join(outDir, 'badge-preview.svg')
    await writeFile(out, badges.latest)
    console.log(`Wrote ${out}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
