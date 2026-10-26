// Desktop/account builds retain their existing behavior. Mobile explicitly turns
// this off before hydration, so stored credentials cannot start background work.
let enabled = true
export function accountsEnabled() { return enabled }
export function setAccountsEnabled(value: boolean) { enabled = value }
