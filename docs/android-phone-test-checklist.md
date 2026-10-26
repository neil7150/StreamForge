# Android phone test package — 25 October 2026

Reference: Nothing Phone 2a Plus, Android 16, 8 GB RAM. Every result below is
pending until an explicitly authorized APK exists. There is no phone action to
perform now. A source check, AAR size or JavaScript export is not a phone result.

## Installation can start without USB

After approval and a test build, transfer the APK to the phone through a method
you already use. Open it from the phone's Files app. Android may ask you to allow
that specific app to install unknown apps; enable it only for the installation
and turn it off afterward. We will provide the actual filename and checksum.
No APK, transfer, installation or sharing has been performed at this checkpoint.

Basic functional tests need no computer connection. For memory/frame/crash
diagnostics, Android wireless debugging can be paired later while both devices
are on the same private Wi-Fi. USB is optional. Pairing details and port numbers
come from the phone at that time; no guessed values are used here.

## Fixture information to record first

- App version/build and APK checksum, phone Android version, network and date.
- No account/backend is needed. Record which direct metadata/source providers
  work on the phone's network and an airplane-mode test.
- A controlled video the tester owns or is permitted to distribute: source hash,
  container, codec, duration and file size. Keep fixture publishing separate from
  testing; do not expose a torrent or open router ports automatically.
- A single-video torrent, a season pack with two clearly named episodes, an
  ambiguous multi-file pack, a source with no peers, and a source larger than
  512 MiB. The large source must be real playable media to exercise rolling cache.
- A direct HTTPS video and, when available, matching subtitles. Record source
  availability so poor peer health can be distinguished from application latency.

Do not put provider keys or loopback session tokens in shared
failure reports. No test fixture has been published by this preparation work.

## Run in this order

| Stage | What to do | Pass condition |
|---|---|---|
| Launch | Open, force-close, reopen. Repeat with airplane mode. | No login required, crash or permanent loading; local library opens and unavailable online providers show a retryable error. |
| Browse/search | Browse movies and series, filter, search, open details, switch seasons. | Correct titles/episodes; empty results and failures are distinct. |
| Sources | Search episode sources directly, close during loading, try another episode, retry offline. | Correct sources; late results do not replace a newer selection. |
| Single video | Play, pause, resume, seek near start/middle/end, retry the same source. | Accurate player state; correct position; retry creates a fresh attempt. |
| Episodes | Select two episodes in one pack; use manual selection for ambiguity. | Correct file and independent resume progress per episode. |
| Cancellation | Play/Back/Play quickly; leave while metadata loads. Repeat 20 times. | Old work stops; previous errors/callbacks do not stop the current stream. |
| Lifecycle | Background, lock/unlock, rotate, and return; also wait over five seconds in background. | Foreground-only policy is honored; progress survives; Retry restarts stopped playback. |
| Audio | Unplug headphones, interrupt audio and restore it. | No unexpected continued playback or crash; state matches the player. |
| Offline library | Save items, disconnect, remove/clear, force-close, reopen and reconnect. | Local data and edits survive; no sync request or sign-in prompt appears. |
| Account-free mode | Inspect Settings/navigation; launch with an older saved account session if available. | No login route or cloud controls; old credentials are not restored and older account data is not merged. |
| Persistence | Change settings/provider keys; restart. Install a later APK signed with the same release key. | Data survives normal restart/update. Clearing app data/uninstalling removes the local library; backup to another device is disabled for v1. |
| Subtitles | Choose matching subtitles, change language, turn Off. | Available cues track playback; Off removes cues without restarting the torrent. |
| Network | Disable/restore Wi-Fi while streaming; test no peers and unsupported media. | Stalls/errors are visible; retry works; no fabricated success. |
| Cache | Stream the >512 MiB source past quota; seek back; stop and clear cache. Test low space separately. | Payload stays bounded; evicted data re-downloads; active playback is protected; low space stops safely. |
| Sustained run | Play for 30 minutes, then stop and leave idle. | No crash/ANR, persistent torrent activity, uncontrolled growth or severe thermal slowdown. |
| Standalone release | After separate release-build permission, launch without Metro and install a signed update. | Bundled JS, stable signing/version and retained local data. |

Clear History removes this phone's local history. No remote collection or cloud
refresh participates in this release. Shared account synchronization remains
future functionality; it is not part of the phone acceptance checklist.

## Measurements, after installation

Use the same source, network and screen settings for comparisons. Record raw
results and the method; these are initial acceptance targets, not achieved values:

| Measurement | Initial target |
|---|---|
| ARM64 release APK | Aim ≤60 MiB; investigate >80 MiB |
| Cold launch | p95 ≤3 seconds over ten launches |
| Idle / 1080p process PSS | Initial budgets 180 / 350 MiB, including native and decoder memory |
| Navigation | Investigate sustained missed frames relative to 60 fps |
| Healthy controlled torrent | First frame within 10 seconds; seek recovery within 3 seconds when data is available |
| Repeated playback cleanup | No monotonic retained growth across 20 cycles; investigate >20 MiB residual growth after settling |
| Battery/heat | Record charge percentage, temperature and elapsed time before/after the 30-minute test |

Memory diagnostics need the complete app process PSS, not only the JavaScript heap.
APK ZIP alignment and all native libraries must be inspected on the actual APK.
The current Go AAR alignment check covers that library only.

For each failure record the stage, exact action, expected/actual behavior, source
identity and approximate time. Stop repeated stress testing if the phone reports
thermal warnings or the same crash repeats. Fix and rerun the affected stage
before a release candidate is approved.
