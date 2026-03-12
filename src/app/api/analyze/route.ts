import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import type { UserAnswers, AnalyzeResponse } from '@/lib/types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';

// Fallback chain: OpenRouter tries each model in order if the previous fails.
const OPENROUTER_MODELS = [
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3.1-pro-preview',
];

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
  const fields = ['q1', 'q3', 'q4', 'q5', 'q6', 'q7'];
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
  const prompt = `Du bist ein Experte für die Positionierung von Selbstständigen und Agenturinhabern und Angebotsstrategien.

**Schritt 1 – Spam-Erkennung:**
Bevor du die Angebotsleiter erstellst, prüfe ob die Eingaben ernsthaft sind oder ob es sich um Spam, Bot-Anfragen oder offensichtliche Test-Eingaben handelt.
Setze "isSpam": true wenn:
- Q1 (Hauptdienstleistung) bedeutungslos ist (z.B. "test", "asdf", "123", "aaa", zufällige Zeichen, nur Leerzeichen)
- Die meisten Felder offensichtlich zufällig oder sinnlos ausgefüllt sind

Setze "isSpam": false bei echten Eingaben – auch wenn sie kurz oder unvollständig sind.
Auch bei "isSpam": true erzeugst du trotzdem eine vollständige Angebotsleiter (mach das Beste draus).

Prüfe außerdem ob der Nutzer in einem der folgenden Bereiche tätig ist:
- Marketing (z.B. Social Media, Content, SEO, SEA, E-Mail, Performance, Copywriting, PR)
- Kreativdienstleistungen (z.B. Design, Branding, Video, Foto, Illustration, UX/UI, Web-/Grafikdesign)
- Development / IT (z.B. Webentwicklung, App-Entwicklung, Software, Automatisierung, KI, IT-Beratung)

Setze "isQualified": true wenn die Hauptdienstleistung eindeutig in einen dieser Bereiche fällt.
Setze "isQualified": false wenn es sich klar um einen anderen Bereich handelt (z.B. Handwerk, Gastronomie, Coaching, Finanzberatung, Immobilien, Logistik etc.).
Im Zweifelsfall setze "isQualified": true.
Auch bei "isQualified": false erzeugst du trotzdem eine vollständige Angebotsleiter.
Wenn der Nutzer "Unter 3.000 €" Umsatz angibt, setze isQualified immer auf false.

**Stil & Sprache (gilt für Schritt 2, für alle titles und descriptions):**
- Keine Em-Dashes. Verwende stattdessen andere Satzzeichen: Punkte, Kommas, Doppelpunkte.
- Keine Buzzwords oder Marketing-Floskeln (z.B. "ganzheitlich", "nachhaltig", "360°", "Transformation", "Game-Changer", "next level", "Synergien", "skalierbar"). Schreibe so, wie ein erfahrener Freelancer mit einem Kunden am Tisch reden würde: klar, konkret, ohne Aufblasen.
- Jede Description muss ein greifbares Ergebnis benennen, nicht nur einen Prozess versprechen.

**Schritt 2 – Angebotsleiter erstellen:**
Erstelle basierend auf den Angaben unten eine **personalisierte Angebotsleiter** mit 4 Stufen für diesen Freelancer. Passe die Preise an, je nachdem welches Preislevel (q6) der Nutzer ausgewählt hat (siehe Preisrahmen weiter unten). Der Preis muss für die vorgeschlagene Dienstleistung und Umsatzniveau sinnvoll sein, aber Premium-Positioniert sein. Der Nutzer soll das Gefühl bekommen, das die Angebotsleiter für ihn ein guter finanzieller Entwicklungsschritt ist, aber nicht unrealistisch wirken.
Wenn du generische oder Fake-Antworten bekommst, mach das Beste draus, aber versuche nicht zu raten oder Dinge zu erfinden, die nicht in den Antworten stehen.

**Angaben:**
- Hauptdienstleistung: ${answers.q1}
- Differenzierung gegenüber Wettbewerbern: ${answers.q3 || '(keine Angabe)'}
- Profitabelster Kundentyp: ${answers.q4 || '(keine Angabe)'}
- Konkretes Problem, das gelöst wird: ${answers.q5 || '(keine Angabe)'}
- Aktueller Monatsumsatz: ${answers.q6 || '(keine Angabe)'}
- Hat festes Angebot/Paket: ${answers.q7 === 'ja' ? 'Ja' : answers.q7 === 'nein' ? 'Nein' : '(keine Angabe)'}

**Preisrahmen:**
- Stufe 1 (Einstieg): Preis = "Kostenfrei", Tag = "Kostenfrei"
- Stufe 2 (Fuß-in-die-Tür): Preis = "${prices.fidt}", Tag = "${prices.fidtTag}"
- Stufe 3 (Hauptangebot): Preis = "${prices.main}", Tag = "${prices.mainTag}"
- Stufe 4 (Retainer): Preis = "${prices.ret}", Tag = "${prices.retTag}"

**Aufgabe:** Gib NUR den folgenden JSON zurück, KEIN weiterer Text:

{
  "isSpam": false oder true, // je nachdem ob die Eingaben offensichtlich Spam sind
  "isQualified": true oder false, // je nachdem ob die Dienstleistung in Marketing, Kreativ oder Dev/IT fällt und der Nutzer nicht "Unter 3.000 €" Umsatz angibt.
  "steps": [
    {
      "title": "<einprägsamer Name für das Kostenfreie Einstiegsangebot, z.B. 'Webdesign-Quick-Check'>",
      "description": "<2–3 Sätze: Was genau bekommt der Kunde? Warum ist das wertvoll? Direkt auf Hauptdienstleistung + Zielgruppe zugeschnitten.>",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
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
}
  

**Beispiele (Falls ein Beispiel perfekt passt, kannst du es auch 1:1 übernehmen):**

// === Beispiel: CR Optimierung ===
{
  "steps": [
    {
      "title": "Landingpage-Schnellcheck",
      "description": "Ich schaue mir deine wichtigste Landingpage an und identifiziere die 3 gravierendsten Conversion-Killer. Du bekommst konkrete Handlungsanweisungen, die du sofort umsetzen kannst.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Umsatzleck-Analyse",
      "description": "Ich werte deine Shop-Daten aus und zeige dir genau, wo dir Umsatz durch die Finger rutscht. Du bekommst einen verständlichen Report mit priorisierten Quick-Wins. Wenn du keinen Mehrwert siehst: Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Conversion-Boost-Programm",
      "description": "Ich setze A/B-Tests für dich auf, werte sie aus und liefere dir die Ergebnisse fertig aufbereitet. Der Preis deiner Umsatzleck-Analyse wird vollständig angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Conversion-Retainer",
      "description": "Jeden Monat eine feste Anzahl Tests plus monatliches Reporting. Bei 6 Monaten Laufzeit bekommst du einen Monat geschenkt, und wenn du im ersten Monat nicht überzeugt bist, kannst du sofort raus.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: Branding ===
{
  "steps": [
    {
      "title": "Brand-Schnelldiagnose",
      "description": "Ich reviewe deine aktuelle CI und gebe dir 3 Quick Tipps, die du noch heute umsetzen kannst, um professioneller aufzutreten.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Brandingkonzept & Logo",
      "description": "Du bekommst ein durchdachtes Brandingkonzept inklusive Logo-Design, das deine Positionierung visuell auf den Punkt bringt. Nicht zufrieden? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Brand-Rollout",
      "description": "Ich setze dein neues Branding auf allen relevanten digitalen Kanälen um. Website, Social Media, E-Mail-Signaturen. Der Preis des Brandingkonzepts wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Brand-Flatrate",
      "description": "Ich bin dein fester Ansprechpartner für alle laufenden Branding-Aufgaben. Monatlicher Fixpreis, planbare Kosten, kein Briefing-Chaos mit wechselnden Freelancern.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: Online-Shop ===
{
  "steps": [
    {
      "title": "Shop-Killer-Audit",
      "description": "Im Live-Call identifiziere ich die 3 größten Umsatzkiller in deinem Shop. Du weißt danach genau, was dich Geld kostet und in welcher Reihenfolge du es fixen solltest.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Killer-Fix Sprint",
      "description": "Ich behebe den größten Shop-Killer direkt für dich. Konkretes Ergebnis statt PowerPoint. Wenn der Fix keinen messbaren Impact hat: Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Shop-Transformation",
      "description": "Dein Shop wird komplett neu aufgesetzt oder die verbleibenden Killer werden systematisch behoben. Der Preis des Killer-Fix Sprints wird voll angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Shop-Wartungspaket",
      "description": "Monatliche Wartung und kontinuierliche Optimierung deines Shops. Fester Preis, feste Leistung, du musst dich um nichts kümmern.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: SEA / Online Marketing ===
{
  "steps": [
    {
      "title": "Ad-Account-Check",
      "description": "Ich schaue in deinen bestehenden Ad Account und sage dir direkt, welche Kampagnen Geld verbrennen und was du sofort ändern solltest.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Kampagnen-Overhaul",
      "description": "Ich optimiere deine bestehenden Kampagnen komplett und setze sauberes Tracking auf, damit du endlich weißt, was wirklich performt. Kein Ergebnis? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Launch-Paket",
      "description": "Neue Kampagnen, neue Creatives, sauber aufgesetzt und live geschaltet. Der Preis des Kampagnen-Overhauls wird verrechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "SEA-Sorglos-Retainer",
      "description": "Monatliche Ad-Account-Verwaltung plus Reporting. Du bekommst ROAS-Optimierung auf Autopilot, ohne selbst im Ads Manager sitzen zu müssen.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: SEO ===
{
  "steps": [
    {
      "title": "SEO-Potenzialanalyse",
      "description": "Ich zeige dir, welches organische Traffic-Potenzial in den nächsten 6 Monaten realistisch erreichbar ist und wo die größten Hebel liegen.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Low-Hanging-Fruits Sprint",
      "description": "Ich setze die SEO-Maßnahmen um, die mit geringstem Aufwand den größten Ranking-Boost bringen. Keine Verbesserung messbar? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "SEO-Masterplan",
      "description": "Ein komplettes SEO-Konzept, priorisiert und auf deine Website zugeschnitten, wird umgesetzt. Der Preis des Low-Hanging-Fruits Sprints wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "SEO-Content-Retainer",
      "description": "Monatlich neue SEO-Artikel plus Ranking-Reportings. Statt immer teurer werdender Ads baust du dir einen Traffic-Kanal auf, der mit der Zeit günstiger wird.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: Webdesign ===
{
  "steps": [
    {
      "title": "Hero-Section-Konzept",
      "description": "Ich entwerfe ein Konzept für deine Hero Section, den wichtigsten Bereich deiner Website. Du siehst sofort, wie dein erster Eindruck auf Besucher wirken könnte.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Quick-Win-Optimierung",
      "description": "Ich optimiere deine bestehende Seite an den Stellen, die den größten Unterschied machen. Kein Redesign, sondern gezielte Eingriffe mit sofort sichtbarem Ergebnis. Kein Mehrwert? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Website-Neubau",
      "description": "Deine komplette Website wird von Grund auf neu gebaut. Strategie, Design, Umsetzung. Der Preis der Quick-Win-Optimierung wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Website-Wartungspaket",
      "description": "Monatliche Updates, Content-Änderungen und technische Pflege zum Fixpreis. Deine Website bleibt aktuell, ohne dass du dich darum kümmern musst.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: Developer / Player Coach ===
{
  "steps": [
    {
      "title": "Architektur-Sparring",
      "description": "Wir besprechen deine aktuelle Dev-Architektur und ich zeige dir, wo die größten technischen Schulden und Optimierungspotenziale liegen.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Architekturplan",
      "description": "Ich erstelle einen konkreten Architekturplan, den dein Team direkt umsetzen kann. Klare Prioritäten, keine Luftschlösser. Kein Nutzen? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Relaunch-Begleitung",
      "description": "Ich begleite euren Neu- oder Relaunch als externer Senior Developer, beratend oder hands-on umsetzend. Der Preis des Architekturplans wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Dev-Team-Retainer",
      "description": "Ich bin euer fester externer Berater mit regelmäßigen Terminen. Motivation, Code-Reviews und State-of-the-Art-Strategie für euer Entwickler-Team.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: LinkedIn Content Marketing ===
{
  "steps": [
    {
      "title": "LinkedIn-Profil-Check",
      "description": "Ich analysiere dein LinkedIn-Profil und zeige dir, was du sofort ändern solltest, um mehr Sichtbarkeit bei deiner Zielgruppe zu bekommen.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Content-Starter-Paket",
      "description": "Du bekommst 4-8 fertige Posts für einen Monat, zugeschnitten auf deine Positionierung und Zielgruppe. Kein Ergebnis? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "300K-Impressions-Programm",
      "description": "In 3 Monaten bringen wir dich auf 300.000+ Impressions durch 1-2 Posts pro Woche. Strategie, Texte, Veröffentlichung. Der Preis des Starter-Pakets wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "LinkedIn Done-for-You",
      "description": "Komplett ausgelagerter LinkedIn-Service. Du gibst Input, ich mache den Rest. Deine Personal Brand wächst, ohne dass du Zeit investieren musst.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: TikTok Marketing ===
{
  "steps": [
    {
      "title": "TikTok-Score",
      "description": "Ich berechne deinen TikTok-Score und zeige dir, ob und wie TikTok für dein Unternehmen als Recruiting- oder Marketing-Kanal funktionieren kann.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "TikTok-Workshop",
      "description": "In einem intensiven Workshop erarbeiten wir deine TikTok-Strategie, Content-Formate und einen Redaktionsplan. Kein Nutzen? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "TikTok Done-4-You",
      "description": "3-6 Monate begleite ich dich komplett: Skripte, Filmanleitung, Schnitt, Veröffentlichung. Der Preis des Workshops wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "TikTok-Komplett-Retainer",
      "description": "Monatliche Skripterstellung, Cutting, Community Management. Alles Done-for-You zum Fixpreis, damit du dich auf dein Kerngeschäft konzentrieren kannst.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: Webflow ===
{
  "steps": [
    {
      "title": "Webflow-Bugfix-Check",
      "description": "Ich schaue mir dein Webflow-Projekt an, finde Bugs und gebe dir eine ehrliche Einschätzung, wo es klemmt und was Priorität hat.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Landingpage-Build",
      "description": "Ich baue dir eine performante Webflow-Landingpage, die konvertiert. Kein Template-Gefrickel, sondern maßgeschneidert. Nicht zufrieden? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Webflow-Komplettpaket",
      "description": "Ein Bundle an Seiten oder eine komplexe Webflow-Seite, komplett umgesetzt. Der Preis der Landingpage wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Webflow-Flatrate",
      "description": "Monatliche Webflow-Betreuung zum Fixpreis. Perfekt für Agenturen und Dienstleister, die einen zuverlässigen Webflow-Entwickler auf Abruf brauchen.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: SCRUM / Workflow ===
{
  "steps": [
    {
      "title": "Workflow-Benchmark",
      "description": "Ich zeige dir Best Practices aus vergleichbaren Branchen und wo dein aktueller Workflow im Vergleich steht. Konkrete Impulse, kein Berater-Blabla.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Workflow-Challenge-Workshop",
      "description": "In einem strukturierten Workshop challengen wir deinen aktuellen Workflow und erarbeiten einen konkreten Plan für den neuen. Festes Ergebnis garantiert. Sonst Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Workflow-Implementierung",
      "description": "Ich implementiere den neuen Workflow in deinem Team. Nicht nur auf Papier, sondern bis er im Alltag läuft. Der Preis des Workshops wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Workflow-Retainer",
      "description": "Ich arbeite aktiv im und am implementierten Workflow mit. Regelmäßige Termine, kontinuierliche Verbesserung. Wie ein interner Mitarbeiter, ohne die Fixkosten.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}

// === Beispiel: Videographer ===
{
  "steps": [
    {
      "title": "Content-Recycling-Check",
      "description": "Ich analysiere dein bestehendes Videomaterial und zeige dir, welche Clips sich in virale Short-Videos verwandeln lassen, ohne einen einzigen neuen Dreh.",
      "price": "Kostenfrei",
      "priceTag": "Kostenfrei"
    },
    {
      "title": "Shorts-Starter",
      "description": "Aus deinem bestehenden Material schneide ich 4-10 virale 9:16 Short-Videos. Kein neuer Dreh nötig. Nicht zufrieden? Geld zurück.",
      "price": "${prices.fidt}",
      "priceTag": "${prices.fidtTag}"
    },
    {
      "title": "Shorts-Boost",
      "description": "10-50 virale 9:16 Short-Videos aus deinem vorhandenen Bewegtbild-Content. Maximale Reichweite, minimaler Aufwand. Der Preis des Starter-Pakets wird angerechnet.",
      "price": "${prices.main}",
      "priceTag": "${prices.mainTag}"
    },
    {
      "title": "Shorts-Flatrate",
      "description": "Jeden Monat eine feste Anzahl Shorts zum Fixpreis. Du lieferst Rohmaterial, ich liefere fertigen Content für alle Plattformen.",
      "price": "${prices.ret}",
      "priceTag": "${prices.retTag}"
    }
  ]
}`;

  // ── Call OpenRouter (with retry on bad schema) ──
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          models: OPENROUTER_MODELS,
          route: 'fallback',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`OpenRouter ${response.status}: ${errBody}`);
      }

      const data = await response.json() as { choices: { message: { content: string } }[] };
      console.log(`[/api/analyze] Attempt ${attempt} raw response:`, JSON.stringify(data).slice(0, 500));
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

      // Normalise booleans (model may omit them)
      if (typeof result.isSpam !== 'boolean') result.isSpam = false;
      if (typeof result.isQualified !== 'boolean') result.isQualified = true;

      console.log('[/api/analyze] Result:', JSON.stringify({ isSpam: result.isSpam, isQualified: result.isQualified, steps: result.steps.map(s => ({ title: s.title, price: s.price })) }, null, 2));

      return NextResponse.json(result);
    } catch (err) {
      lastError = err;
      console.warn(`[/api/analyze] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
    }
  }

  console.error('[/api/analyze] All attempts failed:', lastError);
  return NextResponse.json(
    { error: 'Analyse fehlgeschlagen. Bitte versuche es erneut.' },
    { status: 500 },
  );
}
