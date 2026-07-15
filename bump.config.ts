import { defineConfig } from 'bumpp'

/**
 * Local release flow:
 *   npm run release
 *
 * bumpp bumps package.json, commits, creates vX.Y.Z tag, pushes.
 * .github/workflows/release.yml then tests, creates the GitHub Release,
 * and force-updates the floating major tag (v1, v2, ...).
 */
export default defineConfig({
  commit: 'chore: release v%s',
  tag: 'v%s',
  push: true,
  confirm: true,
  all: true,
  sign: true,
  files: ['package.json', 'package-lock.json'],
})
