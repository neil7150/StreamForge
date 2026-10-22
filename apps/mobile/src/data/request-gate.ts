/** Invalidate old responses immediately, including during the debounce window. */
export class RequestGate {
  private generation = 0
  private controller: AbortController | null = null
  cancel() { this.generation++; this.controller?.abort(); this.controller = null }
  begin() {
    this.cancel()
    const expected = this.generation
    this.controller = new AbortController()
    return { signal: this.controller.signal, isCurrent: () => expected === this.generation }
  }
}
