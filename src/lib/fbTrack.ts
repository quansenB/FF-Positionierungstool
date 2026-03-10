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

function generateEventId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function trackBrowserEvent(
  eventName: string,
  eventId: string,
  userData?: { email?: string; phone?: string },
  data?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  const payload: Record<string, unknown> = { ...data };
  if (userData?.email) payload.em = userData.email;
  if (userData?.phone) payload.ph = userData.phone;
  window.fbq('track', eventName, payload, { eventID: eventId });
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

/**
 * Sends event to BOTH browser Pixel and server CAPI.
 * Generates a unique eventId per call for correct deduplication.
 * Returns the eventId so callers can reference it (e.g. for Lead submission).
 */
export function trackEvent(
  eventName: string,
  userData?: { email?: string; phone?: string },
  customData?: Record<string, unknown>,
): string {
  const eventId = generateEventId();
  trackBrowserEvent(eventName, eventId, userData, customData);
  void trackServerEvent(eventName, eventId, userData, customData);
  return eventId;
}
