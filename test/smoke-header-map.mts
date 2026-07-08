import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { measurePackageSize } from '../src/measure.ts'
import { renderSizeBadges } from '../src/badge.ts'
import { writeCacheArtifacts } from '../src/write-cache.ts'

const execFileAsync = promisify(execFile)

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const root = path.resolve(import.meta.dirname, '..')
const headerMapDir = path.join(root, 'header-map')
const artifactsDir = path.join(root, 'test/artifacts')
const tmpRoot = path.join(root, 'test/tmp')
const repoUrl = 'https://github.com/teplostanski/header-map.git'

const step = async (name: string, fn: () => Promise<void>) => {
  process.stdout.write(`- ${name}... `)
  await fn()
  console.log('ok')
}

const run = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<void> => {
  await execFileAsync(command, args, { cwd, maxBuffer: 10 * 1024 * 1024 })
}

const ensureHeaderMap = async (): Promise<void> => {
  if (!(await exists(path.join(headerMapDir, 'package.json')))) {
    await run('git', ['clone', '--depth', '1', repoUrl, headerMapDir], root)
  }

  if (!(await exists(path.join(headerMapDir, 'dist/index.mjs')))) {
    const hasPnpmLock = await exists(path.join(headerMapDir, 'pnpm-lock.yaml'))
    if (hasPnpmLock) {
      try {
        await run('corepack', ['enable'], headerMapDir)
      } catch {
        // corepack may already be enabled / unavailable
      }
      try {
        await run('pnpm', ['install', '--frozen-lockfile'], headerMapDir)
        await run('pnpm', ['build'], headerMapDir)
        return
      } catch {
        // fall through to npm
      }
    }

    await run('npm', ['install'], headerMapDir)
    await run('npm', ['run', 'build'], headerMapDir)
  }
}

const main = async () => {
  console.log('Real-package smoke (@teplostanski/header-map)\n')
  await mkdir(tmpRoot, { recursive: true })
  await mkdir(artifactsDir, { recursive: true })

  await step('ensure header-map checkout + build', ensureHeaderMap)

  const report = await measurePackageSize({ packageDir: headerMapDir })

  await step('measure real package', async () => {
    assert(
      report.name === '@teplostanski/header-map',
      `unexpected name: ${report.name}`,
    )
    assert(report.entry.includes('dist/'), `entry should be dist: ${report.entry}`)
    assert(report.bytes.raw > 200, `raw too small: ${report.bytes.raw}`)
    assert(report.bytes.gzip > 100, `gzip too small: ${report.bytes.gzip}`)
    assert(
      report.bytes.gzip < 100_000,
      `gzip unexpectedly huge: ${report.bytes.gzip}`,
    )
  })

  console.log(
    `  ${report.name}@${report.version}: raw=${report.bytes.raw} gzip=${report.bytes.gzip} brotli=${report.bytes.brotli}`,
  )

  await step('write SVG + cache artifacts', async () => {
    const badges = renderSizeBadges(report)
    await writeFile(path.join(artifactsDir, 'header-map.svg'), badges.latest)
    await writeFile(
      path.join(artifactsDir, 'header-map.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )

    const cacheDir = path.join(tmpRoot, 'header-map-cache')
    await rm(cacheDir, { recursive: true, force: true })
    const written = await writeCacheArtifacts({
      cacheDir,
      report,
      updateLatestOnPrerelease: false,
    })
    assert(!written.skipped, 'first cache write should not skip')
    await access(path.join(cacheDir, 'badges/latest.svg'))
    await access(
      path.join(cacheDir, 'versions', `${report.version}.json`),
    )
  })

  await step('action entrypoint commit=false', async () => {
    const out = path.join(tmpRoot, 'header-map-github-output.txt')
    await writeFile(out, '')
    await execFileAsync(process.execPath, ['dist/index.js'], {
      cwd: root,
      env: {
        ...process.env,
        INPUT_PATH: './header-map',
        INPUT_COMMIT: 'false',
        GITHUB_OUTPUT: out,
      },
    })
    const output = await readFile(out, 'utf8')
    assert(output.includes(report.version), 'version missing from outputs')
    assert(output.includes('size-gzip'), 'size-gzip missing from outputs')
  })

  console.log('\nReal-package smoke passed.')
  console.log(`SVG: ${path.join(artifactsDir, 'header-map.svg')}`)
}

main().catch((error: unknown) => {
  console.error('\nReal-package smoke failed:', error)
  process.exitCode = 1
})
