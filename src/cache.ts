import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as exec from '@actions/exec'
import { writeCacheArtifacts } from './write-cache.js'
import type { SizeReport } from './types.js'

export type PersistOptions = {
  readonly repoRoot: string
  readonly cacheBranch: string
  readonly token: string
  readonly repository: string
  /** Override remote (file:// or local path) for local integration tests */
  readonly remoteUrl?: string
  readonly report: SizeReport
  readonly updateLatestOnPrerelease: boolean
}

export type PersistResult = {
  readonly skipped: boolean
  readonly versionPath: string
  readonly latestBadgePath: string
}

const run = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  let stdout = ''
  let stderr = ''

  const exitCode = await exec.exec(command, args, {
    cwd,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data) => {
        stdout += data.toString()
      },
      stderr: (data) => {
        stderr += data.toString()
      },
    },
  })

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
}

const mustRun = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<string> => {
  const result = await run(command, args, cwd)
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.exitCode}): ${result.stderr || result.stdout}`,
    )
  }
  return result.stdout
}

const resolveRemote = (options: PersistOptions): string => {
  if (options.remoteUrl) {
    return options.remoteUrl
  }
  return `https://x-access-token:${options.token}@github.com/${options.repository}.git`
}

const ensureCacheCheckout = async (
  cacheDir: string,
  options: PersistOptions,
  remote: string,
): Promise<void> => {
  const fetch = await run(
    'git',
    ['ls-remote', '--heads', remote, options.cacheBranch],
    options.repoRoot,
  )

  const branchExists =
    fetch.exitCode === 0 && fetch.stdout.includes(options.cacheBranch)

  if (branchExists) {
    // clone refuses non-empty dirs; remove placeholder then clone into place
    await rm(cacheDir, { recursive: true, force: true })
    await mustRun(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        options.cacheBranch,
        remote,
        cacheDir,
      ],
      os.tmpdir(),
    )
    return
  }

  await mustRun('git', ['init'], cacheDir)
  await mustRun('git', ['checkout', '-b', options.cacheBranch], cacheDir)
  await mustRun('git', ['remote', 'add', 'origin', remote], cacheDir)
}

/**
 * Clone/create the cache branch in a temp workdir, append version JSON + badges,
 * commit and push. Never rewrites an existing version file.
 */
export const persistSizeReport = async (
  options: PersistOptions,
): Promise<PersistResult> => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'package-size-cache-'))
  const cacheDir = path.join(parent, 'repo')
  await mkdir(cacheDir)
  const remote = resolveRemote(options)

  try {
    await ensureCacheCheckout(cacheDir, options, remote)

    await mustRun(
      'git',
      ['config', 'user.name', 'github-actions[bot]'],
      cacheDir,
    )
    await mustRun(
      'git',
      ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
      cacheDir,
    )

    const written = await writeCacheArtifacts({
      cacheDir,
      report: options.report,
      updateLatestOnPrerelease: options.updateLatestOnPrerelease,
    })

    if (written.skipped) {
      return {
        skipped: true,
        versionPath: written.versionPath,
        latestBadgePath: written.latestBadgePath,
      }
    }

    await mustRun('git', ['add', '.'], cacheDir)
    const status = await mustRun('git', ['status', '--porcelain'], cacheDir)

    if (!status) {
      return {
        skipped: true,
        versionPath: written.versionPath,
        latestBadgePath: written.latestBadgePath,
      }
    }

    await mustRun(
      'git',
      [
        'commit',
        '-m',
        `chore: record ${options.report.name}@${options.report.version} size`,
      ],
      cacheDir,
    )

    await mustRun(
      'git',
      ['push', 'origin', `HEAD:${options.cacheBranch}`],
      cacheDir,
    )

    return {
      skipped: false,
      versionPath: written.versionPath,
      latestBadgePath: written.latestBadgePath,
    }
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
}
