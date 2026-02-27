/**
 * /api/submit-lead – validates opt-in data and forwards to CRM/webhook.
 *
 * Replace the LEAD_WEBHOOK_URL env var with your Make.com / Zapier /
 * n8n / ActiveCampaign webhook URL to pipe leads into your CRM.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { LeadPayload } from '@/lib/types';

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  // Accept any string that contains at least 6 digits
  return /\d{6,}/.test(phone.replace(/[\s\-().+]/g, ''));
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: LeadPayload;
  try {
    body = (await req.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const { email, phone, answers, eventId } = body;

  // ── Validation ──
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Ungültige E-Mail-Adresse.' }, { status: 422 });
  }
  if (!phone || !isValidPhone(phone)) {
    return NextResponse.json({ error: 'Ungültige Telefonnummer.' }, { status: 422 });
  }

  // ── Build webhook payload ──
  const webhookPayload = {
    email,
    phone,
    eventId: eventId ?? '',
    submittedAt: new Date().toISOString(),
    answers: {
      hauptdienstleistung: answers?.q1 ?? '',
      usp: answers?.q2 ?? '',
      differenzierung: answers?.q3 ?? '',
      zielgruppe: answers?.q4 ?? '',
      problem: answers?.q5 ?? '',
      monatsumsatz: answers?.q6 ?? '',
      hatFestesAngebot: answers?.q7 ?? '',
    },
  };

  // ── Forward to webhook (Make / Zapier / n8n) ──
  const webhookUrl = process.env.LEAD_WEBHOOK_URL;

  if (webhookUrl) {
    try {
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookRes.ok) {
        // Log but don't fail the user request – the lead is captured
        console.error('[/api/submit-lead] Webhook returned', webhookRes.status);
      }
    } catch (err) {
      console.error('[/api/submit-lead] Webhook error:', err);
    }
  } else {
    // No webhook configured – log locally for development
    console.info('[/api/submit-lead] Lead captured (no webhook configured):', {
      email,
      phone,
      service: answers?.q1,
    });
  }

  return NextResponse.json({ ok: true });
}
