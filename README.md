# Bundle Size Badge

[![min+gzip](https://raw.githubusercontent.com/teplostanski/header-map/package-size-cache/badges/latest.svg)](https://github.com/teplostanski/header-map)

GitHub Action for **npm** packages: measure default entry as a minified bundle
(`min + gzip` / brotli), append an immutable per-version record, and publish SVG
badges on a dedicated git branch.

No backend. No Bundlephobia rate limits. Size is computed once at release and
cached in your repo.

Live example: [`@teplostanski/header-map`](https://github.com/teplostanski/header-map)
(badge above is served from that repo's `package-size-cache` branch).

## Why

README readers care about **import cost**, not how heavy `node_modules` is on disk.

| Approach | What you get | Weak spot |
| --- | --- | --- |
| Package Phobia / npm "package size" badges | publish/install weight on disk | not what a bundler ships to users |
| Bundlephobia badges | entry bundle min+gzip | remote API rate limits; badge often blank |
| PR size bots (`compressed-size-action`, size-limit, ...) | diff comments on pull requests | not a stable README badge + version history |
| **Bundle Size Badge** | min+gzip (and friends) + append-only history in-repo | you run it in your release CI |

Flow:

`exports/module/main -> esbuild bundle -> minify -> gzip / brotli -> JSON + SVG -> cache branch`

## Usage

Pin a major tag. Compatible releases move the `v1` tag forward; breaking changes
get `v2`.

```yaml
permissions:
  contents: write

steps:
  - uses: actions/checkout@v4

  - name: Build your package
    run: npm ci && npm run build

  - name: Record package size badge
    uses: teplostanski/bundle-size-badge@v1
    with:
      path: .
      # default cache branch; override if you want another name
      cache-branch: package-size-cache
```

Run this **after** your package is built (so `dist` / publish entry exists).
Typical place: release workflow, after a successful `npm publish`.

See [`examples/workflows/publish-with-size-badge.yml`](./examples/workflows/publish-with-size-badge.yml).

### npm trusted publishing

If you publish with npm OIDC trusted publishing, do **not** set `registry-url` on
`actions/setup-node`. That writes `_authToken=${NODE_AUTH_TOKEN}` into `.npmrc`
and breaks OIDC (often as a misleading `E404`). Keep `permissions.id-token: write`
and configure the Trusted Publisher on the npm package page instead.

### Badge markdown

After the first successful run:

```md
![min+gzip](https://raw.githubusercontent.com/<owner>/<repo>/package-size-cache/badges/latest.svg)
```

Per-version badge:

```md
![min+gzip](https://raw.githubusercontent.com/<owner>/<repo>/package-size-cache/badges/1.2.3.svg)
```

Also written on the cache branch: `badges/gzip.svg`, `badges/brotli.svg`,
`badges/minified.svg`. If GitHub CDN caches an old SVG, bust with `?v=<version>`.

## Cache branch

Default branch name: `package-size-cache` (kept for compatibility with early
adopters; override with `cache-branch`).

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

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | Package directory with `package.json` |
| `entry` | _(resolved)_ | Optional entry override |
| `cache-branch` | `package-size-cache` | Append-only history + badges branch |
| `token` | `github.token` | Token with permission to push the cache branch |
| `commit` | `true` | Set `false` to only measure and emit outputs (measure-only) |
| `update-latest-on-prerelease` | `false` | Whether prereleases update `badges/latest.svg` |
| `external` | _(empty)_ | Comma-separated packages left external (not bundled) |
| `working-directory` | `.` | Repo root for git operations |

## Outputs

`version`, `entry`, `size-raw`, `size-gzip`, `size-brotli`, pretty variants,
`badge-path`, `skipped`.

## Limitations

- Measures the **default package entry** (or `entry` input), not every export path
- Bundler is **esbuild**; numbers can differ from Rollup/webpack/Bundlephobia slightly
- Dependencies are **bundled by default** (import-cost style). Peer deps you do not
  want counted should go to `external` (e.g. `react`)
- Tiny packages may show gzip > raw because of gzip headers; that is normal
- Prereleases are stored in history but do not update `latest.svg` unless
  `update-latest-on-prerelease: true`
- Intended for **release/publish** workflows, not every PR commit

Entry resolution order: `entry` input, then `exports`, then `module`, then `main`,
then common fallbacks (`index.js`, `dist/index.js`, ...).

## License

MIT. See [LICENSE](./LICENSE).
