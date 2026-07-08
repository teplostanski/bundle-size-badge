import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { measurePackageSize } from '../src/measure.ts'
import { renderSizeBadges } from '../src/badge.ts'
import { writeCacheArtifacts } from '../src/write-cache.ts'
import { persistSizeReport } from '../src/cache.ts'

const execFileAsync = promisify(execFile)

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const assertSvg = (svg: string, label: string): void => {
  assert(svg.startsWith('<?xml'), `${label}: missing xml prologue`)
  assert(svg.includes('<svg '), `${label}: missing <svg>`)
  assert(svg.includes('</svg>'), `${label}: missing closing tag`)
  assert(
    svg.includes('min+gzip') ||
      svg.includes('min+brotli') ||
      svg.includes('minified'),
    `${label}: missing label`,
  )
  assert(!svg.includes('NaN'), `${label}: contains NaN`)
  assert(!svg.includes('undefined'), `${label}: contains undefined`)
}

const root = path.resolve(import.meta.dirname, '..')
const testDir = path.join(root, 'test')
const tmpRoot = path.join(testDir, 'tmp')
const fixture = path.join(root, 'fixtures/tiny-lib')

const step = async (name: string, fn: () => Promise<void>) => {
  process.stdout.write(`- ${name}... `)
  await fn()
  console.log('ok')
}

const main = async () => {
  console.log('Smoke checks\n')
  await mkdir(tmpRoot, { recursive: true })

  const report = await measurePackageSize({ packageDir: fixture })

  await step('measure fixture', async () => {
    assert(report.name === 'tiny-lib', 'unexpected package name')
    assert(report.version === '1.0.0', 'unexpected version')
    assert(report.bytes.raw > 0, 'raw size must be > 0')
    assert(report.bytes.gzip > 0, 'gzip size must be > 0')
    assert(report.bytes.brotli > 0, 'brotli size must be > 0')
  })

  await step('generate SVG badges', async () => {
    const badges = renderSizeBadges(report)
    assertSvg(badges.latest, 'latest')
    assertSvg(badges.gzip, 'gzip')
    assertSvg(badges.brotli, 'brotli')
    assertSvg(badges.raw, 'raw')

    const previewDir = path.join(testDir, 'artifacts')
    await mkdir(previewDir, { recursive: true })
    await writeFile(path.join(previewDir, 'badge-preview.svg'), badges.latest)
  })

  await step('write cache artifacts to disk', async () => {
    const dir = await mkdtemp(path.join(tmpRoot, 'cache-'))
    try {
      const written = await writeCacheArtifacts({
        cacheDir: dir,
        report,
        updateLatestOnPrerelease: false,
      })
      assert(!written.skipped, 'first write should not skip')
      assert(written.wroteLatest, 'stable release should update latest')

      await access(path.join(dir, 'badges/latest.svg'))
      await access(path.join(dir, 'badges/1.0.0.svg'))
      await access(path.join(dir, 'versions/1.0.0.json'))
      await access(path.join(dir, 'meta.json'))

      const svg = await readFile(path.join(dir, 'badges/latest.svg'), 'utf8')
      assertSvg(svg, 'written latest.svg')

      const again = await writeCacheArtifacts({
        cacheDir: dir,
        report,
        updateLatestOnPrerelease: false,
      })
      assert(again.skipped, 'second write of same version must skip')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  await step('persist + push to local bare git remote', async () => {
    const parent = await mkdtemp(path.join(tmpRoot, 'git-'))
    const bare = path.join(parent, 'remote.git')
    const workspace = path.join(parent, 'workspace')

    try {
      await execFileAsync('git', ['init', '--bare', bare])
      await execFileAsync('git', ['init', workspace])
      await execFileAsync('git', [
        '-C',
        workspace,
        'config',
        'user.email',
        'smoke@example.com',
      ])
      await execFileAsync('git', [
        '-C',
        workspace,
        'config',
        'user.name',
        'Smoke',
      ])

      const first = await persistSizeReport({
        repoRoot: workspace,
        cacheBranch: 'package-size-cache',
        token: 'unused',
        repository: 'local/smoke',
        remoteUrl: bare,
        report,
        updateLatestOnPrerelease: false,
      })
      assert(!first.skipped, 'first persist should push')

      const mirror = path.join(parent, 'mirror')
      await execFileAsync('git', [
        'clone',
        '--branch',
        'package-size-cache',
        bare,
        mirror,
      ])

      const svg = await readFile(path.join(mirror, 'badges/latest.svg'), 'utf8')
      assertSvg(svg, 'remote latest.svg')
      await access(path.join(mirror, 'versions/1.0.0.json'))

      const second = await persistSizeReport({
        repoRoot: workspace,
        cacheBranch: 'package-size-cache',
        token: 'unused',
        repository: 'local/smoke',
        remoteUrl: bare,
        report,
        updateLatestOnPrerelease: false,
      })
      assert(second.skipped, 'duplicate version on remote must skip')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  await step('action entrypoint commit=false', async () => {
    const out = path.join(tmpRoot, 'github-output.txt')
    await writeFile(out, '')
    await execFileAsync(process.execPath, ['dist/index.js'], {
      cwd: root,
      env: {
        ...process.env,
        INPUT_PATH: './fixtures/tiny-lib',
        INPUT_COMMIT: 'false',
        GITHUB_OUTPUT: out,
      },
    })
    const output = await readFile(out, 'utf8')
    assert(output.includes('size-gzip'), 'missing size-gzip output')
    assert(output.includes('version'), 'missing version output')
    await rm(out, { force: true })
  })

  console.log('\nAll smoke checks passed.')
  console.log(`SVG preview: ${path.join(testDir, 'artifacts/badge-preview.svg')}`)
}

main().catch((error: unknown) => {
  console.error('\nSmoke failed:', error)
  process.exitCode = 1
})
