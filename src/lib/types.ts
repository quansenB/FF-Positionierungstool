// ────────────────────────────────────────────────────────────
// Quiz Input
// ────────────────────────────────────────────────────────────

export interface UserAnswers {
  /** Q1 – Hauptdienstleistung */
  q1: string;
  /** Q2 – USP / Was Kunden sagen */
  q2: string;
  /** Q3 – Differenzierung gegenüber Mitbewerbern */
  q3: string;
  /** Q4 – Profitabelster Kundentyp */
  q4: string;
  /** Q5 – Konkretes Problem, das gelöst wird */
  q5: string;
  /** Q6 – Aktueller Monatsumsatz (Chip-Wert) */
  q6: string;
  /** Q7 – Hat festes Angebot: 'ja' | 'nein' */
  q7: string;
}

// ────────────────────────────────────────────────────────────
// Angebotsleiter (Claude Output)
// ────────────────────────────────────────────────────────────

export interface LadderStep {
  /** Short headline for the offer, e.g. "Webdesign-Quick-Check" */
  title: string;
  /** 2–3 sentence personalised description */
  description: string;
  /** Price shown on the ladder badge, e.g. "1.500 – 2.500 €" or "Kostenlos" */
  price: string;
  /** Price shown in the accordion header tag, e.g. "2.000 – 5.000 €" */
  priceTag: string;
}

/**
 * Expected response shape from Claude via /api/analyze.
 *
 * steps[0] = Kostenloser Einstieg  (always shown)
 * steps[1] = Fuß-in-die-Tür        (locked until opt-in)
 * steps[2] = Hauptangebot           (locked until opt-in)
 * steps[3] = Retainer               (locked until opt-in)
 */
export interface AnalyzeResponse {
  steps: [LadderStep, LadderStep, LadderStep, LadderStep];
}

// ────────────────────────────────────────────────────────────
// Facebook Tracking
// ────────────────────────────────────────────────────────────

export interface TrackEventPayload {
  eventName: string;
  eventId: string;
  userData?: {
    email?: string;
    phone?: string;
  };
  customData?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// Lead Submission
// ────────────────────────────────────────────────────────────

export interface LeadPayload {
  email: string;
  phone: string;
  answers: UserAnswers;
  eventId: string;
}
