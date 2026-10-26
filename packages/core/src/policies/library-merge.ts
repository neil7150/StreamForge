/** Last synchronized identity and edit time; no duplicate artwork or media metadata. */
export type LibraryBaseline = Array<[string, number]>

export interface LibraryIdentity<T> {
  key: (item: T) => string
  time: (item: T) => number
}

export function baselineOf<T>(items: T[], identity: LibraryIdentity<T>): LibraryBaseline {
  return items.map(item => [identity.key(item), identity.time(item)])
}

export function hasLibraryChanges<T>(items: T[], baseline: LibraryBaseline, identity: LibraryIdentity<T>): boolean {
  if (items.length !== baseline.length) return true
  const known = new Map(baseline)
  return items.some(item => known.get(identity.key(item)) !== identity.time(item))
}

/**
 * Remote absence deletes unchanged local copies. Only edits made since the
 * baseline are reapplied. Local removes win; concurrent history edits use the
 * latest watched time. Revision checks on upload protect the merged snapshot.
 */
export function mergeLibrary<T>(local: T[], remote: T[], baseline: LibraryBaseline,
  identity: LibraryIdentity<T>, preferNewest = false): T[] {
  const known = new Map(baseline)
  const localKeys = new Set(local.map(identity.key))
  const merged = new Map(remote.map(item => [identity.key(item), item]))
  for (const key of known.keys()) if (!localKeys.has(key)) merged.delete(key)
  for (const item of local) {
    const key = identity.key(item)
    if (known.get(key) === identity.time(item)) continue
    const other = merged.get(key)
    if (!preferNewest || !other || identity.time(item) > identity.time(other)) merged.set(key, item)
  }
  return [...merged.values()]
}
