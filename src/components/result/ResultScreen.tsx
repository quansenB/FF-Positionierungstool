"use client";

import { useState, useRef } from "react";
import Script from "next/script";
import type { AnalyzeResponse, UserAnswers } from "@/lib/types";
import StageCard from "./StageCard";

interface Props {
  answers: UserAnswers;
  result: AnalyzeResponse | null;
  isAnalyzing: boolean;
  analyzeError: boolean;
  isUnlocked: boolean;
  onUnlock: (email: string, phone: string) => Promise<boolean>;
  onRetry: () => void;
}

const STAGE_DESCRIPTIONS = [
  "Dein Einstieg in die Kundenbeziehung. Du gibst kostenlos echten Mehrwert, z.B. durch einen kurzen Audit, eine Analyse oder eine Consultation. Das Ziel: Vertrauen aufbauen und zeigen, dass du weißt, wovon du redest.",
  "Der erste bezahlte Auftrag. Klein genug, dass es ein No-Brainer ist. Absicherung: Geld-zurück-Garantie bei Unzufriedenheit. Das eliminiert das letzte Zögern.",
  "Dein Signature-Angebot mit dem größten Umsatzhebel. Der Kunde kennt dich bereits und vertraut dir. Ein Teil des Fuß-in-die-Tür-Angebots wird verrechnet, was den Umstieg erleichtert.",
  "Planbarer, wiederkehrender Umsatz. Monatliche Zusammenarbeit auf Basis des Hauptangebots. Absicherung: z.B. 6 Monate Bindung mit einem Monat gratis, Abbruch im ersten Monat möglich.",
];

const STAGE_TITLES = [
  "Kostenloser Value",
  "Fuß-in-die-Tür-Angebot",
  "Hauptangebot",
  "Retainer",
];

export default function ResultScreen({
  answers,
  result,
  isAnalyzing,
  analyzeError,
  isUnlocked,
  onUnlock,
  onRetry,
}: Props) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Price tags shown in accordion headers (generic fallback before AI result)
  const priceTags = result
    ? result.steps.map((s) => s.priceTag)
    : ["Kostenlos", "2.000 – 5.000 €", "5.000 – 30.000 €", "100 – 10.000 €/Mo"];

  const handleUnlock = async () => {
    let hasError = false;

    if (!email || !email.includes("@")) {
      setEmailError(true);
      triggerShake(emailRef.current);
      hasError = true;
    } else {
      setEmailError(false);
    }

    if (!phone || phone.trim() === "") {
      setPhoneError(true);
      triggerShake(phoneRef.current);
      hasError = true;
    } else {
      setPhoneError(false);
    }

    if (hasError) return;

    setIsSubmitting(true);
    const ok = await onUnlock(email, phone);
    setIsSubmitting(false);

    if (!ok) {
      // Surface a gentle error without breaking the form
      alert("Es gab einen Fehler beim Freischalten. Bitte versuche es erneut.");
    }
  };

  return (
    <div className="screen">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="result-header">
        <h2>Deine Positionierungsleiter</h2>
        <p>So könnte eine durchdachte Angebotsstruktur für dich aussehen.</p>
      </div>

      {/* ── Concept explanation ─────────────────────────── */}
      <div className="concept-box">
        <h3>Was ist eine Angebotsleiter?</h3>
        <p>
          Die meisten Freelancer verkaufen ein einziges Angebot und hoffen, dass
          der Kunde sofort Ja sagt. Das Problem: Der Kunde kennt dich nicht,
          vertraut dir nicht und hat keine Ahnung, ob du liefern kannst.
        </p>
        <p>
          Die Angebotsleiter löst das. Du baust 4 Stufen auf, die das Commitment
          des Kunden schrittweise erhöhen. Vom kostenlosen Einstieg bis zur
          langfristigen Zusammenarbeit.
        </p>

        <div className="commitment-bar">
          <div className="commitment-seg">Kostenlos</div>
          <div className="commitment-seg">Fuß in die Tür</div>
          <div className="commitment-seg">Hauptangebot</div>
          <div className="commitment-seg">Retainer</div>
        </div>
        <div className="commitment-labels">
          <span>Commitment 0–2</span>
          <span>3–4</span>
          <span>5–7</span>
          <span>8–10</span>
        </div>
      </div>

      {/* ── Stage Accordions ─────────────────────────────── */}
      {/* <div className="section-label">Die 4 Stufen erklärt</div>
      <div className="stage-explain">
        {STAGE_TITLES.map((title, i) => (
          <StageCard
            key={i}
            number={i + 1}
            title={title}
            priceTag={priceTags[i]}
            description={STAGE_DESCRIPTIONS[i]}
          />
        ))}
      </div> */}

      {/* ── Personalized Ladder ─────────────────────────── */}
      <div className="section-label">Dein persönlicher Entwurf</div>

      {isAnalyzing && (
        <div className="loading-state">
          <p>Deine Angebotsleiter wird generiert …</p>
          <div className="loading-dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {analyzeError && !isAnalyzing && (
        <div className="error-state">
          <p>Die Analyse konnte nicht abgeschlossen werden.</p>
          <a className="btn-primary" href="/">
            Erneut versuchen
          </a>
        </div>
      )}

      {!isAnalyzing && !analyzeError && result && (
        <>
          <div className="ladder">
            <div className="ladder-line" />

            {/* Step 1 – always visible */}
            <LadderStep
              label="Stufe 1 · Kostenloser Einstieg"
              title={result.steps[0].title}
              description={result.steps[0].description}
              price={result.steps[0].price}
              visible
            />

            {/* Steps 2–4 with paywall overlay */}
            <div className="paywall-wrap">
              <LadderStep
                label="Stufe 2 · Fuß-in-die-Tür-Angebot"
                title={result.steps[1].title}
                description={result.steps[1].description}
                price={result.steps[1].price}
                visible={isUnlocked}
                locked={!isUnlocked}
              />
              <LadderStep
                label="Stufe 3 · Hauptangebot"
                title={result.steps[2].title}
                description={result.steps[2].description}
                price={result.steps[2].price}
                visible={isUnlocked}
                locked={!isUnlocked}
              />
              <LadderStep
                label="Stufe 4 · Retainer"
                title={result.steps[3].title}
                description={result.steps[3].description}
                price={result.steps[3].price}
                visible={isUnlocked}
                locked={!isUnlocked}
              />

              {!isUnlocked && (
                <div className="paywall-overlay">
                  <div className="optin-box">
                    <div className="optin-lock">
                      <svg
                        width="22"
                        height="22"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="3"
                          y="11"
                          width="18"
                          height="11"
                          rx="2"
                          stroke="#e55d3c"
                          strokeWidth="2"
                        />
                        <path
                          d="M7 11V7a5 5 0 0110 0v4"
                          stroke="#e55d3c"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <h3>Deine komplette Leiter freischalten</h3>
                    <p>
                      Erhalte alle 4 Stufen mit konkreten Angebotsvorschlägen
                      und Preisempfehlungen, individuell für dich.
                    </p>
                    <div className="optin-form">
                      <input
                        ref={emailRef}
                        type="email"
                        placeholder="Deine E-Mail-Adresse"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                        style={
                          emailError ? { borderColor: "#e55d3c" } : undefined
                        }
                      />
                      <input
                        ref={phoneRef}
                        type="tel"
                        placeholder="Deine Telefonnummer"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                        style={
                          phoneError ? { borderColor: "#e55d3c" } : undefined
                        }
                      />
                      <button
                        className="btn-primary"
                        onClick={handleUnlock}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Einen Moment …" : "Freischalten"}
                      </button>
                    </div>
                    {/* <div className="optin-trust">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      Kein Spam. Jederzeit abmeldbar.
                    </div> */}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Unlocked confirmation ─────────────────────── */}
          {isUnlocked && (
            <div className="result-unlocked">
              <div className="unlocked-msg">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M22 11.08V12a10 10 0 11-5.93-9.14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M22 4L12 14.01l-3-3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Alle Stufen freigeschaltet
              </div>
            </div>
          )}

          {/* ── CTA ──────────────────────────────────────── */}
          {isUnlocked && (
            <div className="result-cta">
              <h4>Das war erst der Anfang.</h4>
              <p>
                Das ist natürlich eine automatisierte Auswertung. In einem
                persönlichen Gespräch gehen wir noch mal tiefer rein – checken
                alles gegen und schleifen deine Angebotsleiter auf deine
                individuelle Situation fein.
              </p>
              <div
                className="calendly-inline-widget calendly-wrap"
                data-url="https://calendly.com/finally-freelancing-analysegespraech/erstgespraech?hide_landing_page_details=1&hide_gdpr_banner=1&background_color=ffffff"
                style={{ minWidth: "320px", height: "700px" }}
              />
              <Script
                src="https://assets.calendly.com/assets/external/widget.js"
                strategy="lazyOnload"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Ladder Step sub-component ──────────────────────────────

interface LadderStepProps {
  label: string;
  title: string;
  description: string;
  price: string;
  visible?: boolean;
  locked?: boolean;
}

function LadderStep({
  label,
  title,
  description,
  price,
  visible,
  locked,
}: LadderStepProps) {
  const cls = `ladder-step${visible ? " visible" : ""}${locked ? " locked" : ""}`;
  return (
    <div className={cls}>
      <div className="ladder-dot-wrap">
        <div className="ladder-dot" />
      </div>
      <div className="ladder-content">
        <div className="ladder-label">{label}</div>
        <div className="ladder-card">
          <h4>{title}</h4>
          <p>{description}</p>
          <div className="ladder-price">{price}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function triggerShake(el: HTMLElement | null) {
  if (!el) return;
  el.style.animation = "shake 0.4s ease";
  setTimeout(() => {
    el.style.animation = "";
  }, 400);
}
