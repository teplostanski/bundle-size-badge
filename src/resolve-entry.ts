import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

type PackageJson = {
  readonly name?: string
  readonly version?: string
  readonly main?: string
  readonly module?: string
  readonly browser?: string | Record<string, string>
  readonly exports?: ExportsField
}

type ExportsField =
  | string
  | readonly string[]
  | { readonly [key: string]: ExportsField | undefined }

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const tryResolveFile = async (
  packageDir: string,
  candidate: string,
): Promise<string | null> => {
  const absolute = path.resolve(packageDir, candidate)

  if (await fileExists(absolute)) {
    return absolute
  }

  const withJs = absolute.endsWith('.js') ? absolute : `${absolute}.js`
  if (await fileExists(withJs)) {
    return withJs
  }

  const asIndex = path.join(absolute, 'index.js')
  if (await fileExists(asIndex)) {
    return asIndex
  }

  return null
}

/** Prefer ESM-ish conditions, then fall back through nested export maps. */
const pickFromExports = (field: ExportsField | undefined): string | null => {
  if (field == null) {
    return null
  }

  if (typeof field === 'string') {
    return field
  }

  if (Array.isArray(field)) {
    for (const item of field) {
      const found = pickFromExports(item)
      if (found) {
        return found
      }
    }
    return null
  }

  const record = field as Record<string, ExportsField | undefined>
  const preferredKeys = [
    'import',
    'module',
    'browser',
    'default',
    'require',
    'node',
  ] as const

  for (const key of preferredKeys) {
    if (key in record) {
      const found = pickFromExports(record[key])
      if (found) {
        return found
      }
    }
  }

  if ('.' in record) {
    return pickFromExports(record['.'])
  }

  return null
}

export type ResolvedPackage = {
  readonly packageJsonPath: string
  readonly packageDir: string
  readonly name: string
  readonly version: string
  readonly entry: string
}

export const readPackageJson = async (
  packageDir: string,
): Promise<PackageJson> => {
  const packageJsonPath = path.join(packageDir, 'package.json')
  const raw = await readFile(packageJsonPath, 'utf8')
  return JSON.parse(raw) as PackageJson
}

/**
 * Resolve the default package entry the way size tools roughly do:
 * explicit override, then exports["."], then module, then main, then index.js
 */
export const resolvePackageEntry = async (
  packageDir: string,
  entryOverride?: string,
): Promise<ResolvedPackage> => {
  const absoluteDir = path.resolve(packageDir)
  const packageJsonPath = path.join(absoluteDir, 'package.json')
  const pkg = await readPackageJson(absoluteDir)

  if (!pkg.name) {
    throw new Error(`package.json at ${packageJsonPath} is missing "name"`)
  }

  if (!pkg.version) {
    throw new Error(`package.json at ${packageJsonPath} is missing "version"`)
  }

  const candidates: string[] = []

  if (entryOverride) {
    candidates.push(entryOverride)
  } else {
    const fromExports = pickFromExports(pkg.exports)
    if (fromExports) {
      candidates.push(fromExports)
    }

    if (typeof pkg.browser === 'string') {
      candidates.push(pkg.browser)
    }

    if (pkg.module) {
      candidates.push(pkg.module)
    }

    if (pkg.main) {
      candidates.push(pkg.main)
    }

    candidates.push('index.js', 'index.mjs', 'dist/index.js', 'lib/index.js')
  }

  for (const candidate of candidates) {
    const resolved = await tryResolveFile(absoluteDir, candidate)
    if (resolved) {
      return {
        packageJsonPath,
        packageDir: absoluteDir,
        name: pkg.name,
        version: pkg.version,
        entry: resolved,
      }
    }
  }

  throw new Error(
    `Could not resolve package entry in ${absoluteDir}. Tried: ${candidates.join(', ')}`,
  )
}
