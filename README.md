# Package Size Badge Action

GitHub Action that measures an npm package the way README readers care about:

`default entry -> esbuild bundle -> minify -> gzip / brotli`

Then it appends an immutable per-version record and SVG badges to a dedicated
branch (`package-size-cache` by default). No backend. No Bundlephobia rate limits.

## Why

- Package Phobia shows install/publish weight on disk, not import cost
- Bundlephobia badges often die on rate limits because size is computed on demand
- Package version size is immutable: measure once at release, cache forever

## Badge in README

After the first successful run:

```md
![min+gzip](https://raw.githubusercontent.com/<owner>/<repo>/package-size-cache/badges/latest.svg)
```

Per-version badge:

```md
![min+gzip](https://raw.githubusercontent.com/<owner>/<repo>/package-size-cache/badges/1.2.3.svg)
```

## Cache branch layout

```text
package-size-cache/
  meta.json
  README.md
  versions/
    1.0.0.json
    1.1.0.json
  badges/
    latest.svg
    gzip.svg
    brotli.svg
    minified.svg
    1.0.0.svg
```

Existing `versions/<version>.json` files are never overwritten.

## Usage

```yaml
permissions:
  contents: write

steps:
  - uses: actions/checkout@v4

  - name: Build your package
    run: npm ci && npm run build

  - name: Record package size badge
    uses: <owner>/package-size-badge-action@v1
    with:
      path: .
      cache-branch: package-size-cache
```

See [`examples/workflows/publish-with-size-badge.yml`](./examples/workflows/publish-with-size-badge.yml)
for a publish-oriented workflow.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | Package directory with `package.json` |
| `entry` | _(resolved)_ | Optional entry override |
| `cache-branch` | `package-size-cache` | Append-only history + badges branch |
| `token` | `github.token` | Token with permission to push the cache branch |
| `commit` | `true` | Set `false` to only measure and emit outputs |
| `update-latest-on-prerelease` | `false` | Whether prereleases update `badges/latest.svg` |
| `external` | _(empty)_ | Comma-separated packages left external (not bundled) |

### Outputs

`version`, `entry`, `size-raw`, `size-gzip`, `size-brotli`, pretty variants,
`badge-path`, `skipped`.

## Local measurement

```bash
npm ci
npm run measure -- ./fixtures/tiny-lib
npm run measure -- ./fixtures/tiny-lib --write-badge
# preview: test/artifacts/badge-preview.svg

# real package (nested clone, gitignored)
npm run measure -- ./header-map --write-badge
npm run test:real
```

## Develop

```bash
npm ci
npm test            # fixture smokes
npm run test:real   # @teplostanski/header-map
npm run test:all
```

Layout:

```text
src/           action source
examples/      consumer workflow examples
fixtures/      tiny synthetic packages
header-map/    real package under test (nested git repo, gitignored)
test/          smoke tests + local artifacts
```

`header-map` is [teplostanski/header-map](https://github.com/teplostanski/header-map)
(`@teplostanski/header-map` on npm). Kept as a nested git checkout (not a submodule
yet; this action repo is not initialized). CI clones it when missing.

This is a **composite** action: at runtime it runs `npm ci --omit=dev` inside the
action directory (so the correct `esbuild` binary is installed for the runner OS),
then executes `dist/index.js`.

Commit `dist/index.js` and `package-lock.json` before tagging a release.

## Notes

- Entry resolution order: `entry` input, then `exports`, then `module`, then `main`, then common fallbacks
- Dependencies are bundled by default (Bundlephobia-like). Use `external` to exclude peers (e.g. `react`)
- Prerelease versions (`1.2.3-beta.1`) are stored in history but do not update `latest.svg` unless configured
