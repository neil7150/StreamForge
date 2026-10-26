import { TRACKERS, extractInfoHashFromMagnet } from '../../../../packages/core/src/search/provider-policy'

/** Keep supplied native trackers; add bounded fallbacks only for trackerless magnets. */
export function prepareMobileMagnet(value: string): string {
  if (!extractInfoHashFromMagnet(value)) throw new Error('Invalid magnet link: missing info hash')
  const magnet = new URL(value)
  if (magnet.protocol !== 'magnet:') throw new Error('Invalid magnet link: unsupported protocol')
  const supported = (tracker: string) => {
    try { return ['udp:', 'https:', 'http:'].includes(new URL(tracker).protocol) } catch { return false }
  }
  let trackers = [...new Set(magnet.searchParams.getAll('tr').filter(supported))].slice(0, 16)
  if (!trackers.length) {
    trackers = [...TRACKERS.filter(tracker => tracker.startsWith('https:')).slice(0, 2),
      ...TRACKERS.filter(tracker => tracker.startsWith('udp:')).slice(0, 6)]
  }
  magnet.searchParams.delete('tr')
  for (const tracker of trackers) magnet.searchParams.append('tr', tracker)
  return magnet.toString().replace(/([?&]xt=)urn%3Abtih%3A/gi, '$1urn:btih:').replace(/([?&]xt=)urn%3Abtmh%3A/gi, '$1urn:btmh:')
}
