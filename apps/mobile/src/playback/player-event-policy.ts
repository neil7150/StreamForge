/** Queued events from a replaced source must not close its replacement attempt. */
export function acceptsPlayerStatus(sourceActive: boolean, eventStatus: string, nativeStatus: string): boolean {
  return sourceActive && eventStatus === nativeStatus
}
