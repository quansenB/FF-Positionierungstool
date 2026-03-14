/**
 * /api/early-optin – fires immediately after the optin gate, before AI generation.
 * Sends email, phone, quiz answers and UTM params to the fallback Make webhook
 * so no lead is lost even if the AI call fails or the user closes the tab.
 */

import { NextRequest, NextResponse } from "next/server";

const FALLBACK_WEBHOOK = "https://hook.eu1.make.com/l4e8pf3t4mtpv45jkjr2d2u74lbdm2jm";

export async function POST(req: NextRequest) {
  let body: {
    email: string;
    phone: string;
    answers: Record<string, string>;
    utm: Record<string, string>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const { email, phone, answers, utm } = body;

  const payload = {
    email,
    phone,
    submittedAt: new Date().toISOString(),
    answers: {
      hauptdienstleistung: answers?.q1 ?? "",
      differenzierung: answers?.q3 ?? "",
      zielgruppe: answers?.q4 ?? "",
      problem: answers?.q5 ?? "",
      monatsumsatz: answers?.q6 ?? "",
      hatFestesAngebot: answers?.q7 ?? "",
    },
    utm: utm ?? {},
  };

  try {
    await fetch(FALLBACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[/api/early-optin] Webhook error:", err);
  }

  return NextResponse.json({ ok: true });
}
