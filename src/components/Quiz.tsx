'use client';

import { useState, useEffect, useRef } from 'react';
import type { UserAnswers, AnalyzeResponse } from '@/lib/types';
import { trackBrowserEvent, trackEvent } from '@/lib/fbTrack';
import Header from './Header';
import ProgressBar from './ProgressBar';
import ResultScreen from './result/ResultScreen';

// ─── Types ──────────────────────────────────────────────────

type Screen =
  | 'intro'
  | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7'
  | 'loading'
  | 'result';

const Q_SCREENS: Screen[] = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const TOTAL_Q = 7;

const REVENUE_OPTIONS = [
  'Unter 3.000 €',
  '3.000 – 5.000 €',
  '5.000 – 10.000 €',
  '10.000 – 20.000 €',
  'Über 20.000 €',
];

const DEFAULT_ANSWERS: UserAnswers = {
  q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: '',
};

const FALLBACK_RESULT: AnalyzeResponse = {
  steps: [
    {
      title: 'Kostenloser Profil Check',
      description: 'Ich analysiere dein LinkedIn-Profil und deine aktuelle Content-Positionierung in 15 Minuten und zeige dir die 3 größten Hebel für mehr Sichtbarkeit und qualifizierte Anfragen. Kein Pitch, nur konkretes Feedback.',
      price: 'Kostenlos',
      priceTag: 'Kostenlos',
    },
    {
      title: 'Content-Positionierungs-Sprint',
      description: 'In einem 90-minütigen Workshop entwickeln wir deine Nische, dein Kernthema und dein Angebotsversprechen. Du gehst mit einem fertigen Positionierungs-Statement und einer Contentplan-Vorlage raus. Geld-zurück-Garantie bei Unzufriedenheit.',
      price: '500 – 1.500 €',
      priceTag: '500 – 1.500 €',
    },
    {
      title: 'Content-Strategie & Aufbau',
      description: 'Wir bauen gemeinsam deine vollständige Content-Strategie: Themenarchitektur, Redaktionsplan, Distribution und Conversion-Strecke. Der Sprint-Preis wird vollständig angerechnet.',
      price: '3.000 – 8.000 €',
      priceTag: '3.000 – 8.000 €',
    },
    {
      title: 'Content-Retainer',
      description: 'Monatliche Zusammenarbeit mit Content-Beratung, Sparring und Umsetzungsbegleitung. Planbare Einnahmen für dich, planbare Content-Qualität für deine Kunden.',
      price: '800 – 2.500 € / Monat',
      priceTag: '800 – 2.500 €/Mo',
    },
  ],
};

// ─── Shake helper ────────────────────────────────────────────
function shakeElement(el: HTMLElement | null) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => { el.style.animation = ''; }, 400);
}

// ─── Icons ──────────────────────────────────────────────────

function ArrowLeft() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main Quiz Component ─────────────────────────────────────

export default function Quiz() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [screenKey, setScreenKey] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>(DEFAULT_ANSWERS);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [analyzeError] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [eventId, setEventId] = useState('');
  const [fieldError, setFieldError] = useState(false);

  // Callback ref for the primary interactive element on each question screen
  const primaryEl = useRef<HTMLElement | null>(null);
  const setPrimaryRef = (el: HTMLElement | null) => { primaryEl.current = el; };

  useEffect(() => {
    const id = `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setEventId(id);
    trackBrowserEvent('PageView', id);
  }, []);

  const goTo = (s: Screen) => {
    setFieldError(false);
    setScreen(s);
    setScreenKey(k => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setAnswer = <K extends keyof UserAnswers>(key: K, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
    if (fieldError) setFieldError(false);
  };

  const goToIfFilled = (value: string, next: Screen) => {
    if (!value.trim()) {
      setFieldError(true);
      shakeElement(primaryEl.current);
      return;
    }
    goTo(next);
  };

  const goToIfSelected = (value: string, next: Screen) => {
    if (!value) {
      setFieldError(true);
      shakeElement(primaryEl.current);
      return;
    }
    goTo(next);
  };

  // ── Navigate to loading screen immediately, then fetch Claude ──
  const handleShowResult = async () => {
    if (!answers.q7) {
      setFieldError(true);
      shakeElement(primaryEl.current);
      return;
    }

    setResult(null);
    goTo('loading');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });

      if (!res.ok) throw new Error(`${res.status}`);

      const data: AnalyzeResponse = await res.json();
      setResult(data);

      if (eventId) {
        trackEvent('QuizComplete', eventId, undefined, { service: answers.q1 });
      }

      goTo('result');
    } catch {
      setResult(FALLBACK_RESULT);
      goTo('result');
    }
  };

  // ── Unlock (opt-in) ─────────────────────────────────────────
  const handleUnlock = async (email: string, phone: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, answers, eventId }),
      });

      if (!res.ok) return false;

      if (eventId) trackEvent('Lead', eventId, { email, phone });
      setIsUnlocked(true);
      return true;
    } catch {
      return false;
    }
  };

  const progressIndex = Q_SCREENS.indexOf(screen as (typeof Q_SCREENS)[number]);
  const showProgress = progressIndex >= 0;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="app">
      <Header />
      {showProgress && (
        <ProgressBar current={progressIndex + 1} total={TOTAL_Q} />
      )}

      <div key={screenKey}>

        {/* ── Intro ── */}
        {screen === 'intro' && (
          <div className="screen">
            <div className="intro">
              <div className="intro-badge">
                <BoltIcon />
                Kostenlos · 2 Minuten
              </div>
              <h1>Finde deine <em>Positionierung</em> als Freelancer</h1>
              <p>
                7 Fragen. Dein individueller Entwurf für eine Angebotsleiter,
                mit der du planbarer verkaufst und höhere Preise durchsetzt.
              </p>
              <div className="intro-features">
                <div><CheckIcon /> Stärken erkennen</div>
                <div><CheckIcon /> Angebotsleiter bauen</div>
                <div><CheckIcon /> Sofort umsetzbar</div>
              </div>
              <button className="btn-primary" onClick={() => goTo('q1')}>
                Jetzt starten
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="briefing-box">
                <div className="briefing-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="briefing-text">
                  <strong>Je mehr Details, desto besser dein Ergebnis.</strong> Die KI generiert deine Positionierung auf Basis deiner Antworten — sei so konkret und spezifisch wie möglich.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Q1 ── */}
        {screen === 'q1' && (
          <div className="screen">
            <div className="question-num">Frage 1 von 7</div>
            <div className="question-title">Was ist deine Hauptdienstleistung?</div>
            <div className="question-sub">Die eine Sache, mit der du den Großteil deines Umsatzes machst.</div>
            <input
              ref={setPrimaryRef as React.RefCallback<HTMLInputElement>}
              type="text"
              className={`input-text${fieldError ? ' error' : ''}`}
              value={answers.q1}
              onChange={e => setAnswer('q1', e.target.value)}
              placeholder="z.B. Webdesign, Copywriting, Performance Marketing..."
              autoFocus
            />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('intro')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q1, 'q2')}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q2 ── */}
        {screen === 'q2' && (
          <div className="screen">
            <div className="question-num">Frage 2 von 7</div>
            <div className="question-title">Was schätzen deine Kunden am meisten an dir?</div>
            <div className="question-sub">Der eine Satz, den dein bester Kunde über dich sagen würde.</div>
            <input
              ref={setPrimaryRef as React.RefCallback<HTMLInputElement>}
              type="text"
              className={`input-text${fieldError ? ' error' : ''}`}
              value={answers.q2}
              onChange={e => setAnswer('q2', e.target.value)}
              placeholder='z.B. "Er liefert schnell und denkt mit."'
              autoFocus
            />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('q1')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q2, 'q3')}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q3 ── */}
        {screen === 'q3' && (
          <div className="screen">
            <div className="question-num">Frage 3 von 7</div>
            <div className="question-title">Worin bist du besser als 90% deiner Mitbewerber?</div>
            <div className="question-sub">Dein unfairer Vorteil. Das, was dich wirklich unterscheidet.</div>
            <input
              ref={setPrimaryRef as React.RefCallback<HTMLInputElement>}
              type="text"
              className={`input-text${fieldError ? ' error' : ''}`}
              value={answers.q3}
              onChange={e => setAnswer('q3', e.target.value)}
              placeholder="z.B. Branchenexpertise im E-Commerce, schnelle Umsetzung..."
              autoFocus
            />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('q2')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q3, 'q4')}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q4 ── */}
        {screen === 'q4' && (
          <div className="screen">
            <div className="question-num">Frage 4 von 7</div>
            <div className="question-title">Wer ist dein profitabelster Kundentyp?</div>
            <div className="question-sub">Branche + Rolle. Wer zahlt am meisten und macht am wenigsten Stress?</div>
            <input
              ref={setPrimaryRef as React.RefCallback<HTMLInputElement>}
              type="text"
              className={`input-text${fieldError ? ' error' : ''}`}
              value={answers.q4}
              onChange={e => setAnswer('q4', e.target.value)}
              placeholder="z.B. E-Commerce-Unternehmer mit 1-5 Mio. Umsatz"
              autoFocus
            />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('q3')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q4, 'q5')}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q5 ── */}
        {screen === 'q5' && (
          <div className="screen">
            <div className="question-num">Frage 5 von 7</div>
            <div className="question-title">Welches konkrete Problem löst du für diese Kunden?</div>
            <div className="question-sub">Nicht was du tust, sondern welches Ergebnis du lieferst.</div>
            <textarea
              ref={setPrimaryRef as React.RefCallback<HTMLTextAreaElement>}
              className={`input-text${fieldError ? ' error' : ''}`}
              value={answers.q5}
              onChange={e => setAnswer('q5', e.target.value)}
              placeholder='z.B. "Meine Kunden haben zu wenig qualifizierte Leads und verlieren Umsatz an Wettbewerber mit besserer Online-Präsenz."'
              autoFocus
            />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('q4')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q5, 'q6')}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q6 ── */}
        {screen === 'q6' && (
          <div className="screen">
            <div className="question-num">Frage 6 von 7</div>
            <div className="question-title">Wie hoch ist dein aktueller Monatsumsatz?</div>
            <div className="question-sub">Grobe Einordnung reicht. Damit passen wir die Preisempfehlung an.</div>
            <div
              ref={setPrimaryRef as React.RefCallback<HTMLDivElement>}
              className={`range-options${fieldError ? ' selection-error' : ''}`}
            >
              {REVENUE_OPTIONS.map(opt => (
                <div
                  key={opt}
                  className={`range-chip${answers.q6 === opt ? ' selected' : ''}`}
                  onClick={() => setAnswer('q6', opt)}
                >
                  {opt}
                </div>
              ))}
            </div>
            {fieldError && <div className="field-error-msg">Bitte wähle eine Option aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('q5')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfSelected(answers.q6, 'q7')}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q7 ── */}
        {screen === 'q7' && (
          <div className="screen">
            <div className="question-num">Frage 7 von 7</div>
            <div className="question-title">Hast du ein klar definiertes Angebot mit festem Preis?</div>
            <div className="question-sub">Kein Stundensatz, sondern ein Paket oder Festpreis-Angebot.</div>
            <div
              ref={setPrimaryRef as React.RefCallback<HTMLDivElement>}
              className={`yesno-grid${fieldError ? ' selection-error' : ''}`}
            >
              <div
                className={`yesno-card${answers.q7 === 'ja' ? ' selected' : ''}`}
                onClick={() => setAnswer('q7', 'ja')}
              >
                <div className="yesno-icon">✓</div>
                <div className="yesno-label">Ja</div>
                <div className="yesno-sub">Ich habe klare Pakete</div>
              </div>
              <div
                className={`yesno-card${answers.q7 === 'nein' ? ' selected' : ''}`}
                onClick={() => setAnswer('q7', 'nein')}
              >
                <div className="yesno-icon">✗</div>
                <div className="yesno-label">Nein</div>
                <div className="yesno-sub">Ich arbeite nach Stunden</div>
              </div>
            </div>
            {fieldError && <div className="field-error-msg">Bitte wähle eine Option aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo('q6')}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={handleShowResult}>
                Ergebnis anzeigen
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {screen === 'loading' && (
          <div className="screen">
            <div className="loading-screen">
              <div className="loading-screen-icon">
                <svg width="32" height="32" fill="none" viewBox="0 0 24 24">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2>Deine Angebotsleiter<br />wird erstellt …</h2>
              <p>Wir analysieren deine Antworten und bauen eine individuelle Leiter für dich.</p>
              <div className="loading-steps">
                <div className="loading-step loading-step--done">
                  <CheckIcon /> Antworten ausgewertet
                </div>
                <div className="loading-step loading-step--active">
                  <span className="loading-step-dot" /> Angebotsstruktur wird generiert
                </div>
                <div className="loading-step loading-step--pending">
                  <span className="loading-step-dot" /> Preisempfehlungen berechnen
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {screen === 'result' && (
          <ResultScreen
            answers={answers}
            result={result}
            isAnalyzing={false}
            analyzeError={false}
            isUnlocked={isUnlocked}
            onUnlock={handleUnlock}
            onRetry={handleShowResult}
          />
        )}
      </div>
    </div>
  );
}
