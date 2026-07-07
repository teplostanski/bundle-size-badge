import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { persistSizeReport } from './cache.js'
import { formatBytes } from './format.js'
import { measurePackageSize } from './measure.js'

const parseExternal = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const parseBoolean = (value: string, fallback: boolean): boolean => {
  if (value === '') {
    return fallback
  }
  return value === 'true'
}

async function run(): Promise<void> {
  const packagePath = core.getInput('path') || '.'
  const entry = core.getInput('entry') || undefined
  const cacheBranch = core.getInput('cache-branch') || 'package-size-cache'
  const token = core.getInput('token') || process.env.GITHUB_TOKEN || ''
  const shouldCommit = parseBoolean(core.getInput('commit'), true)
  const updateLatestOnPrerelease = parseBoolean(
    core.getInput('update-latest-on-prerelease'),
    false,
  )
  const external = parseExternal(core.getInput('external'))
  const workingDirectory = path.resolve(
    process.cwd(),
    core.getInput('working-directory') || '.',
  )
  const packageDir = path.resolve(workingDirectory, packagePath)

  const report = await measurePackageSize({
    packageDir,
    entryOverride: entry,
    external,
    gitSha: github.context.sha || null,
  })

  core.info(
    `Measured ${report.name}@${report.version} via ${report.entry}: ` +
      `${formatBytes(report.bytes.raw)} min / ${formatBytes(report.bytes.gzip)} gzip / ${formatBytes(report.bytes.brotli)} brotli`,
  )

  core.setOutput('version', report.version)
  core.setOutput('entry', report.entry)
  core.setOutput('size-raw', String(report.bytes.raw))
  core.setOutput('size-gzip', String(report.bytes.gzip))
  core.setOutput('size-brotli', String(report.bytes.brotli))
  core.setOutput('size-raw-pretty', formatBytes(report.bytes.raw))
  core.setOutput('size-gzip-pretty', formatBytes(report.bytes.gzip))
  core.setOutput('size-brotli-pretty', formatBytes(report.bytes.brotli))

  if (!shouldCommit) {
    core.setOutput('skipped', 'false')
    core.setOutput('badge-path', 'badges/latest.svg')
    core.info('commit=false: measurement only, cache branch untouched')
    return
  }

  if (!token) {
    throw new Error(
      'A GitHub token is required to push the cache branch (input: token)',
    )
  }

  const repository =
    process.env.GITHUB_REPOSITORY ||
    `${github.context.repo.owner}/${github.context.repo.repo}`

  const persisted = await persistSizeReport({
    repoRoot: workingDirectory,
    cacheBranch,
    token,
    repository,
    report,
    updateLatestOnPrerelease,
  })

  core.setOutput('skipped', String(persisted.skipped))
  core.setOutput('badge-path', persisted.latestBadgePath)

  if (persisted.skipped) {
    core.info(
      `Version ${report.version} already exists on ${cacheBranch}; left untouched`,
    )
    return
  }

  const [owner, repo] = repository.split('/')
  core.info(
    `Updated ${cacheBranch}. Badge: https://raw.githubusercontent.com/${owner}/${repo}/${cacheBranch}/${persisted.latestBadgePath}`,
  )
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  core.setFailed(message)
})
