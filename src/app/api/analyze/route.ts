import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import type { UserAnswers, AnalyzeResponse } from '@/lib/types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-opus-4-5';

// ─── Pricing tiers (mirrors original JS logic, now server-side) ──────────────

interface PriceTier {
  fidt: string;       // ladder badge price for step 2
  main: string;       // ladder badge price for step 3
  ret: string;        // ladder badge price for step 4
  fidtTag: string;    // accordion header tag for step 2
  mainTag: string;    // accordion header tag for step 3
  retTag: string;     // accordion header tag for step 4
}

function getPriceTier(revenue: string): PriceTier {
  if (revenue.includes('Unter 3')) {
    return { fidt: '1.500 – 2.500 €', main: '3.000 – 8.000 €', ret: '300 – 800 € / Monat', fidtTag: '2.000 – 5.000 €', mainTag: '5.000 – 15.000 €', retTag: '300 – 2.000 €/Mo' };
  }
  if (revenue.includes('3.000')) {
    return { fidt: '2.000 – 3.500 €', main: '5.000 – 12.000 €', ret: '500 – 1.500 € / Monat', fidtTag: '2.000 – 5.000 €', mainTag: '5.000 – 15.000 €', retTag: '500 – 2.500 €/Mo' };
  }
  if (revenue.includes('5.000')) {
    return { fidt: '2.500 – 5.000 €', main: '8.000 – 20.000 €', ret: '1.000 – 3.000 € / Monat', fidtTag: '2.500 – 5.000 €', mainTag: '8.000 – 20.000 €', retTag: '1.000 – 5.000 €/Mo' };
  }
  if (revenue.includes('10.000')) {
    return { fidt: '3.500 – 5.000 €', main: '10.000 – 25.000 €', ret: '2.000 – 5.000 € / Monat', fidtTag: '3.500 – 5.000 €', mainTag: '10.000 – 25.000 €', retTag: '2.000 – 7.500 €/Mo' };
  }
  if (revenue.includes('20.000')) {
    return { fidt: '5.000+ €', main: '15.000 – 30.000 €', ret: '3.000 – 10.000 € / Monat', fidtTag: '5.000 € +', mainTag: '15.000 – 30.000 €', retTag: '3.000 – 10.000 €/Mo' };
  }
  // Default (no revenue selection)
  return { fidt: '2.000 – 3.500 €', main: '5.000 – 12.000 €', ret: '500 – 1.500 € / Monat', fidtTag: '2.000 – 5.000 €', mainTag: '5.000 – 30.000 €', retTag: '100 – 10.000 €/Mo' };
}

// ─── Input validation ─────────────────────────────────────────────────────────

function validateAnswers(body: unknown): body is UserAnswers {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  const fields = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
  for (const f of fields) {
    if (typeof b[f] !== 'string') return false;
    if ((b[f] as string).length > 1000) return false; // hard cap per field
  }
  // q1 (Hauptdienstleistung) is required to generate a meaningful result
  if (!(b.q1 as string).trim()) return false;
  return true;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Rate limiting ──
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous';

  const { allowed, retryAfterMs } = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warte kurz.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  }

  // ── Parse & validate ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  if (!validateAnswers(body)) {
    return NextResponse.json({ error: 'Fehlende oder ungültige Eingaben.' }, { status: 400 });
  }

  const answers = body as UserAnswers;
  const prices = getPriceTier(answers.q6);

  // ── Claude prompt ──
  const prompt = `Du bist ein Experte für Freelancer-Positionierung und Angebotsstrategien.

Erstelle basierend auf den Angaben unten eine **personalisierte Angebotsleiter** mit 4 Stufen für diesen Freelancer.

**Angaben:**
- Hauptdienstleistung: ${answers.q1}
- Differenzierung gegenüber Wettbewerbern: ${answers.q3 || '(keine Angabe)'}
- Profitabelster Kundentyp: ${answers.q4 || '(keine Angabe)'}
- Konkretes Problem, das gelöst wird: ${answers.q5 || '(keine Angabe)'}
- Aktueller Monatsumsatz: ${answers.q6 || '(keine Angabe)'}
- Hat festes Angebot/Paket: ${answers.q7 === 'ja' ? 'Ja' : answers.q7 === 'nein' ? 'Nein' : '(keine Angabe)'}

**Preisrahmen (vorgegeben, NICHT ändern):**
- Stufe 2 (Fuß-in-die-Tür): Preis = "${prices.fidt}", Tag = "${prices.fidtTag}"
- Stufe 3 (Hauptangebot): Preis = "${prices.main}", Tag = "${prices.mainTag}"
- Stufe 4 (Retainer): Preis = "${prices.ret}", Tag = "${prices.retTag}"

**Aufgabe:** Gib NUR den folgenden JSON zurück, KEIN weiterer Text:

{
  "steps": [
    {
      "title": "<einprägsamer Name für das kostenlose Einstiegsangebot, z.B. 'Webdesign-Quick-Check'>",
      "description": "<2–3 Sätze: Was genau bekommt der Kunde? Warum ist das wertvoll? Direkt auf Hauptdienstleistung + Zielgruppe zugeschnitten.>",
      "price": "Kostenlos",
      "priceTag": "Kostenlos"
    },
    {
      "title": "<einprägsamer Name für das erste bezahlte Paket>",
      "description": "<2–3 Sätze: Konkretes Ergebnis, klare Abgrenzung, Geld-zurück-Garantie erwähnen.>",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "<einprägsamer Name für das Signature-Angebot>",
      "description": "<2–3 Sätze: Gesamter Transformationsprozess, Verweis auf Anrechnung des Fuß-in-die-Tür-Preises.>",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "<einprägsamer Name für den Retainer>",
      "description": "<2–3 Sätze: Monatliche Zusammenarbeit, Bindungsmodell, planbare Einnahmen.>",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}`;

  // ── Call OpenRouter ──
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Empty response from OpenRouter');
    }

    // Strip potential markdown code fences
    const rawText = rawContent.replace(/```(?:json)?\n?/g, '').trim();
    const result = JSON.parse(rawText) as AnalyzeResponse;

    // Validate shape
    if (
      !Array.isArray(result.steps) ||
      result.steps.length !== 4 ||
      !result.steps.every(
        s => typeof s.title === 'string' && typeof s.description === 'string' &&
             typeof s.price === 'string' && typeof s.priceTag === 'string',
      )
    ) {
      throw new Error('Unexpected response shape from OpenRouter');
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/analyze] Error:', err);
    return NextResponse.json(
      { error: 'Analyse fehlgeschlagen. Bitte versuche es erneut.' },
      { status: 500 },
    );
  }
}
