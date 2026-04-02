const WELCOME_DISMISSED_KEY = 'ace-daw-welcome-dismissed';

/** Returns true if the user has already dismissed the welcome overlay. */
export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark the welcome overlay as dismissed. */
export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
  } catch { /* quota exceeded — ignore */ }
}
