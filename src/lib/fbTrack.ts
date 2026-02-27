/**
 * Client-side Facebook tracking helpers.
 * Fires both a browser Pixel event (fbq) AND a server-side CAPI event
 * via /api/track for reliable dual-tracking with deduplication.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq: (...args: any[]) => void;
  }
}

export function trackBrowserEvent(
  eventName: string,
  eventId: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('track', eventName, data ?? {}, { eventID: eventId });
}

export async function trackServerEvent(
  eventName: string,
  eventId: string,
  userData?: { email?: string; phone?: string },
  customData?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, eventId, userData, customData }),
    });
  } catch {
    // Fire-and-forget – tracking failures must never break the user flow.
  }
}

/** Sends event to BOTH browser Pixel and server CAPI. */
export function trackEvent(
  eventName: string,
  eventId: string,
  userData?: { email?: string; phone?: string },
  customData?: Record<string, unknown>,
): void {
  trackBrowserEvent(eventName, eventId, customData);
  void trackServerEvent(eventName, eventId, userData, customData);
}
