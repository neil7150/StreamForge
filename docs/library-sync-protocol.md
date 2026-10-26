# Library sync and authentication — 25 October 2026

The shared mobile client and user service use a revisioned snapshot contract.
Deploy migration `services/user/db/migrations/002_sync_revisions.up.sql` before
serving the updated API. The user service now fails startup if migrations fail.
No deployment or migration against an external database was performed here.

## Contract

- `GET /api/v1/sync/watchlist` and `/history` return
  `{ success: true, data: { items: [], revision: 0 } }` for an empty collection.
- `PUT` requires `{ items: [...], revision: <last-read revision> }`. Missing/null
  items and unversioned requests are rejected with HTTP 400. An explicit empty
  array is permitted with the correct revision for an intentional clear.
- Each collection has its own revision, scoped to the authenticated account.
  Reads lock the revision row while reading items. Writes lock that same row,
  compare the revision before deleting anything, replace items within the
  transaction, increment the revision and acknowledge `{ data: { revision } }`.
  Stale writes return HTTP 409; database errors roll back the replacement.
- The server derives stable UUIDs from account, collection and content key. It
  ignores supplied item ownership/IDs. Missing/invalid timestamps are normalized
  to server time; valid timestamps are preserved. The client uploads the original
  `added_at` and `watched_at` values, not the time a sync happens.
- Snapshots reject duplicate/blank keys, invalid progress/times, invalid JSON
  metadata and oversized collections. Limits are 5,000 watchlist items, 50 history
  items and 64 KiB of metadata per item, subject to the HTTP body limit.

`contracts/library-snapshots.json` is checked by Go's real Fiber handlers with an
injected store and by the mobile runtime parser. This checks the wire format
across languages. Transaction unit tests use a pgx transaction test double.
The separate [local integration suite](backend-integration-tests.md) now also
passes against real PostgreSQL 16, including migrations, lock contention and
rollback. It uses a temporary HTTPS gateway and a test-only Redis emulator;
deployed gateway/Redis and Android checks remain pending.

## Client ownership and recovery

The client serializes reads/uploads per account generation. It must successfully
read and validate both collections before its first replacement upload. Failed
or malformed initial reads prevent all uploads. Responses/queued work for a
previous login cannot change the active account. An in-flight request already
sent retains its original account token; subsequent collection uploads stop if
the account changes.

The mobile store keeps a compact baseline of the last read or acknowledged
identity/edit-time pairs for each collection. Items and baselines are persisted
in one account-scoped `streamforge_library_v2` record, so a restart cannot pair
new synchronization metadata with an older item list. No backend contract change
or additional migration is required for this follow-up.

On a read, the store compares local items with that baseline, then reapplies only
pending local changes to the current cloud snapshot:

| Situation | Resolution |
|---|---|
| An unchanged local item is absent from the cloud | Remove the local copy, including when the cloud collection is empty. |
| A local addition has not been acknowledged | Preserve it and upload against the freshly read revision. |
| A local item was removed | Remove that identity from the merged snapshot. |
| A history item was changed on both devices | Prefer the newer `watchedAt`; this relies on device clocks, not a global operation order. |
| Playback resumes after an item was deleted remotely | The explicit pending playback update can recreate the history entry. |
| An acknowledged deletion is followed by a remote re-add | Accept the re-add; no permanent blacklist remains. |
| Clear History while offline | Remove the entries visible on this device. Preserve new remote entries the device had never seen. |

A removal of a newly added, not-yet-read identity uses a temporary baseline marker.
Markers disappear once the remote snapshot confirms absence or a replacement
upload is acknowledged. Baselines are bounded to 6,000 entries per collection;
reaching that bound blocks further removals with a visible message rather than
silently forgetting them. Watchlists remain limited to 5,000 items and history to
50. Baselines contain no duplicate media metadata or images.

Acknowledgment advances only the collection and snapshot actually sent. Edits
made during an upload remain pending in the same persisted record. A partial
failure does not replay an already acknowledged collection as new local edits.
A conflict or failed request keeps local data and requires a fresh read on Retry.
An unchanged collection is not uploaded. Library tab focus and pull-to-refresh
read current cloud data; no polling loop was added.

Logout clears credentials and invalidates queued work. It does not start a final
upload that races revocation. Pending edits remain in that account's saved record.
Malformed v2 records are preserved and block cloud writes instead of being
interpreted as an empty library.

### Upgrade and conflict limits

The first import from the older three-key format preserves local items as pending
additions and imports its deletion markers. That old format cannot distinguish
an acknowledged local copy from an offline addition, so historical remote deletes
cannot be reconstructed reliably during that first import. The new policy applies
once a baseline has been recorded. Old keys remain as migration backups and are
not reread after the v2 record exists.

If an upload commits but its acknowledgment is lost, local intent remains pending
until a read reconciles it. A later concurrent remote deletion can therefore be
superseded by that unacknowledged local addition. This is an explicit pending-edit
policy, not server-side exactly-once operation processing. Older desktop API/store
copies still need adoption; their unversioned uploads remain rejected.

Tests exercise restart, remote deletion, offline additions, edits during uploads,
partial failures, re-add and corrupt storage. The local PostgreSQL/HTTPS suite also
switches between two independent persisted adapters using the real mobile store
and API client. Those are simulated devices, not physical Android validation.

## Token renewal

The shared API client performs one retry after a protected request receives
HTTP 401. Concurrent requests share renewal; auth endpoints do not recursively
refresh. Account generation, base URL and abort state are checked before replay.
An old account's body must never be resent with a replacement account's token.
Startup cloud reads wait for the stored session's renewal attempt. A network
failure retains local account data; rejected refresh credentials clear the
session. No background refresh timer is required.

The auth server consumes each refresh token atomically with Redis `GETDEL`.
Concurrent requests cannot rotate the same token twice. A missing token is an
authentication error; a token-store outage is a server error. Three rounds of
eight concurrent refresh requests are covered by the local integration suite.

## Pending staging and device checks

1. The disposable PostgreSQL/local HTTPS checks now pass. Repeat the deployment
   checks with a real Redis server and staging gateway/proxy configuration.
2. Use a deployed HTTPS gateway to test registration/login, two-item uploads,
   restart/re-download, offline edits, deletion, conflict retry and account
   switching during requests. Use a short staging token TTL to test renewal.
3. Following separate APK approval, verify the same flows on the Nothing Phone
   2a Plus, including SecureStore, process death and a signed update.

`npm run validate:mobile` now includes every backend service in addition to the
mobile/core checks and torrent daemon. No validation step generates an APK.
