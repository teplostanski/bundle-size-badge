import { formatBytes } from './format.js'
import type { SizeReport } from './types.js'

type BadgeOptions = {
  readonly label: string
  readonly message: string
  readonly color: string
}

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

/** Rough width estimate for DejaVu-ish sans used by classic badges. */
const textWidth = (text: string): number =>
  Math.ceil([...text].reduce((width, char) => {
    // Digits and punctuation are a bit narrower than letters.
    if (/[0-9.,]/.test(char)) {
      return width + 6
    }
    if (char === ' ') {
      return width + 4
    }
    return width + 7
  }, 0))

export const renderBadgeSvg = ({
  label,
  message,
  color,
}: BadgeOptions): string => {
  const labelWidth = textWidth(label) + 10
  const messageWidth = textWidth(message) + 10
  const totalWidth = labelWidth + messageWidth
  const labelX = labelWidth / 2
  const messageX = labelWidth + messageWidth / 2

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(label)}: ${escapeXml(message)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${escapeXml(label)}</text>
    <text x="${labelX * 10}" y="140" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${escapeXml(label)}</text>
    <text aria-hidden="true" x="${messageX * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(messageWidth - 10) * 10}">${escapeXml(message)}</text>
    <text x="${messageX * 10}" y="140" transform="scale(.1)" textLength="${(messageWidth - 10) * 10}">${escapeXml(message)}</text>
  </g>
</svg>
`
}

const colorForGzip = (bytes: number): string => {
  if (bytes < 5_000) return '#4c1'
  if (bytes < 25_000) return '#97ca00'
  if (bytes < 75_000) return '#dfb317'
  if (bytes < 150_000) return '#fe7d37'
  return '#e05d44'
}

export const renderSizeBadges = (report: SizeReport) => {
  const gzipPretty = formatBytes(report.bytes.gzip)

  return {
    latest: renderBadgeSvg({
      label: 'min+gzip',
      message: gzipPretty,
      color: colorForGzip(report.bytes.gzip),
    }),
    gzip: renderBadgeSvg({
      label: 'min+gzip',
      message: gzipPretty,
      color: colorForGzip(report.bytes.gzip),
    }),
    brotli: renderBadgeSvg({
      label: 'min+brotli',
      message: formatBytes(report.bytes.brotli),
      color: colorForGzip(report.bytes.brotli),
    }),
    raw: renderBadgeSvg({
      label: 'minified',
      message: formatBytes(report.bytes.raw),
      color: colorForGzip(report.bytes.raw),
    }),
  }
}
