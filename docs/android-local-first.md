# Device-local Android release — 26 October 2026

## Current scope

The user changed the intended architecture to a native phone app without accounts
or required servers operated by them. Accounts may be added in the future. This
document supersedes the previous hosting-first release prerequisites. No APK build
has been authorized or performed. Botkeep resources were not changed or deleted.

The app retains React Native UI, the Kotlin bridge, Go native torrent engine and
native video player. Torrent/media data is handled on the phone through the
existing loopback playback path. Watchlist, last 50 history entries, progress and
preferences use on-device storage. The existing 512 MiB torrent cache bound is
unchanged. These are configured bounds, not measured Android RSS/battery results.

## Implemented changes

- Mobile startup disables account features before hydration. It hydrates only
  guest/local library keys plus preferences, does not load saved account sessions,
  and never selects an older account library. Older credential/account records
  are left untouched for a deliberate future migration; they are not used or
  silently merged. Existing guest/local records retain their stable keys.
- Shared account code has an explicit feature boundary. Disabled mode blocks login,
  registration, OAuth, renewal, session restoration and cloud sync, including stale
  authenticated in-memory state. Default behavior for existing account builds is
  retained and covered by existing tests. There is no mobile UI to enable accounts.
- The login route/deep link and settings controls are removed from navigation.
  Settings explains device-local storage, uninstall/data-clear loss and external
  provider connectivity. Library has no cloud refresh/upload controls. Local
  deletion does not accumulate cloud tombstones or require a sync to proceed.
- Home, Browse, Search and movie details use a mobile catalog adapter over the
  existing Cinemeta and TVmaze clients. Series details, seasons and episodes use
  TVmaze directly. There are no calls to our catalog/auth/sync API in these flows.
  A stale EXPO_PUBLIC_API_BASE_URL is ignored by this mobile release.
- Provider IDs are retained (`cinemeta:tt...` movie slugs, numeric TVmaze IDs and
  `tvmaze:...` series slugs), so a locally saved title opens through the same
  provider after restart. Old backend-only slugs show a recovery/search message
  instead of accidentally being interpreted as another provider ID. Existing
  history with a saved magnet can continue through the native player.
- Home labels reflect the limited provider list instead of claiming a recently
  released catalog. Browse paginates the finite provider list; Search is separate
  and is not restricted to those browse entries. Partial search results are marked
  when one metadata provider fails; total failure remains an error. Episodes have
  a retry state. Unknown episode numbers are not silently treated as episode 1.
- In-memory metadata caches have a maximum of 100 entries per client and evict
  expired entries on insert. TVmaze's season-number mapping is capped at 2,048
  entries and refreshed on cached season-list reads. No new dependency was added.
- Release/readiness checks identify `device-local` mode and no longer require an
  owned HTTPS backend. APK authorization and private release signing gates remain.

No owned server does not mean no network services. Public metadata, artwork,
torrent/source providers, trackers/peers and optional subtitles still need internet
and can fail or be unavailable by region. These providers receive requests directly
from the phone. TVmaze is credited with its public API/license link in Settings;
its [API documentation](https://www.tvmaze.com/api) describes public metadata access.

## Validation and practical limits

New source regressions exercise stored-credential isolation, disabled auth/cloud
requests, local library persistence across hydration/restart, account-record
preservation, provider identities, partial/total failure, cancellation and cache
eviction. Mobile/core TypeScript and the full source validator pass. No new native
bridge/engine changes were made, so the previous library validation is historical
evidence, not a fresh physical-phone result.

The production JS/assets export is checked separately; it is not an APK. Direct
catalog/provider access and Android networking must still be tested on the Nothing
Phone 2a Plus after an explicitly authorized build. Persisting the catalog itself
for offline browsing, local library export/import, torrent-file import and managed
background downloads are not added by this change. Existing magnet input and
deep links remain supported.

Final evidence: 46 mobile logic tests and seven shared policy tests pass (53
total); mobile/core TypeScript, backend/shared Go and daemon suites pass through
the source validator. Production export and the updated readiness checker pass;
the source-map inventory excludes the mobile Login screen and inspected advisory
tooling. Hermes bytecode is **3,359,024 bytes**, which is not an APK size or memory
measurement. The native library was unchanged and was not rebuilt in this step.
A live read-only PC check reached both public providers without account/backend
credentials, returning 30 movie summaries, series summaries, movie/series details,
five seasons for the sampled series and seven episodes for its first season.
These live sample counts are verification evidence, not fixed catalog sizes.
Android provider access and native playback remain unverified until a phone build
is explicitly authorized. Logs: `.cache/device-local-source-validation.log`,
`.cache/device-local-logic-final.log`, `.cache/device-local-export.log` and
`.cache/android-apk-readiness.json`.

## User tests after APK permission

1. Launch without signing in. Home, Browse, Search, Library and Settings must be
   reachable. No sign-in screen or cloud-sync control should appear.
2. Force-close and launch in airplane mode: the app and local library/preferences
   must open, and online catalog errors must be retryable rather than block launch.
3. Save movies and series, play a controlled magnet, stop and reopen. Check
   watchlist, resume position, selected episode/file and preferences are preserved.
4. Clear history/remove a watchlist entry offline, restart and reconnect: removed
   items must stay removed. Deleting app data/uninstalling is expected to erase the
   local library; Android backup remains disabled.
5. With internet, test movie/series search, details, seasons/episodes, source
   selection and a no-peers source. Provider failure must not erase the library.
6. Follow the lifecycle/cache/performance tests in `android-phone-test-checklist.md`.

No USB setup or hosting work is required now. APK size, installed JNI behavior,
playback codecs, memory, thermal behavior and battery remain device-test gates.
