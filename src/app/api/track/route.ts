/**
 * /api/track – Server-side Facebook Conversions API (CAPI) endpoint.
 *
 * Works in tandem with the browser Pixel to enable dual-tracking.
 * The shared event_id prevents double-counting in Facebook's attribution.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { TrackEventPayload } from '@/lib/types';

// SHA-256 hash helper (required by Facebook CAPI for PII)
function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone: string): string {
  // Remove all non-digit characters except leading +
  return phone.replace(/[^\d+]/g, '');
}

export async function POST(req: NextRequest) {
  const pixelId = process.env.FB_PIXEL_ID;
  const accessToken = process.env.FB_ACCESS_TOKEN;

  // If not configured, silently succeed (tracking is optional)
  if (!pixelId || !accessToken) {
    return NextResponse.json({ ok: true, reason: 'not_configured' });
  }

  let body: TrackEventPayload;
  try {
    body = (await req.json()) as TrackEventPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { eventName, eventId, userData, customData } = body;

  if (!eventName || typeof eventName !== 'string') {
    return NextResponse.json({ error: 'Missing eventName' }, { status: 400 });
  }

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    undefined;

  const clientUserAgent = req.headers.get('user-agent') ?? undefined;
  const eventSourceUrl = req.headers.get('referer') ?? undefined;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: {
          em: userData?.email ? sha256(userData.email) : undefined,
          ph: userData?.phone ? sha256(normalizePhone(userData.phone)) : undefined,
          client_ip_address: clientIp,
          client_user_agent: clientUserAgent,
        },
        custom_data: customData,
      },
    ],
  };

  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    const fbData = await fbRes.json();

    if (!fbRes.ok) {
      console.error('[/api/track] Facebook CAPI error:', fbData);
      return NextResponse.json({ ok: false, error: fbData }, { status: 502 });
    }

    return NextResponse.json({ ok: true, data: fbData });
  } catch (err) {
    console.error('[/api/track] Network error:', err);
    return NextResponse.json({ ok: false, error: 'Network error' }, { status: 502 });
  }
}
