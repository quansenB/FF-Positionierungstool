"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import type { UserAnswers, AnalyzeResponse, UtmParams } from "@/lib/types";
import { trackEvent } from "@/lib/fbTrack";
import Header from "./Header";
import ProgressBar from "./ProgressBar";

// ── Replace with your actual video URL ──────────────────────
const VIDEO_URL = "/platzhalter.mp4";
// ────────────────────────────────────────────────────────────

type Screen =
  | "intro"
  | "q1"
  | "q3"
  | "q4"
  | "q5"
  | "q6"
  | "q7"
  | "email-gate"
  | "video";

const REVENUE_OPTIONS = [
  "Unter 3.000 €",
  "3.000 – 5.000 €",
  "5.000 – 10.000 €",
  "10.000 – 20.000 €",
  "Über 20.000 €",
];

const DEFAULT_ANSWERS: UserAnswers = {
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  q5: "",
  q6: "",
  q7: "",
};

function shakeElement(el: HTMLElement | null) {
  if (!el) return;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "shake 0.4s ease";
  setTimeout(() => { el.style.animation = ""; }, 400);
}

// ─── Icons ───────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────

export default function QuizStart() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [screenKey, setScreenKey] = useState(0);
  const [answers, setAnswers] = useState<UserAnswers>(DEFAULT_ANSWERS);
  const [utm, setUtm] = useState<UtmParams>({});
  const [fieldError, setFieldError] = useState(false);

  // Email gate
  const [capturedEmail, setCapturedEmail] = useState("");
  const [capturedPhone, setCapturedPhone] = useState("");
  const [emailGateError, setEmailGateError] = useState(false);
  const [phoneGateError, setPhoneGateError] = useState(false);
  const emailGateRef = useRef<HTMLInputElement>(null);
  const phoneGateRef = useRef<HTMLInputElement>(null);

  // Analysis state
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [analyzeError, setAnalyzeError] = useState(false);
  const [apiDone, setApiDone] = useState(false);

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastValidTimeRef = useRef(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const resultSectionRef = useRef<HTMLDivElement>(null);

  const primaryEl = useRef<HTMLElement | null>(null);
  const setPrimaryRef = (el: HTMLElement | null) => { primaryEl.current = el; };

  const resultVisible = apiDone && videoProgress >= 0.9;

  // Capture UTM params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const captured: UtmParams = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
      const val = p.get(key);
      if (val) captured[key] = val;
    }
    setUtm(captured);
  }, []);

  // As soon as API returns: submit full lead (don't wait for video)
  useEffect(() => {
    if (!apiDone || !result) return;
    fetch("/api/submit-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: capturedEmail, phone: capturedPhone, answers, result, utm }),
    }).then((res) => {
      if (res.ok && !result.isSpam && result.isQualified !== false && answers.q6 !== "Unter 3.000 €") {
        trackEvent("Lead", { email: capturedEmail, phone: capturedPhone });
      }
    }).catch(() => {});
  }, [apiDone]);

  // When result becomes visible (apiDone + video 90%): scroll
  useEffect(() => {
    if (!resultVisible) return;
    setTimeout(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }, [resultVisible]);

  const goTo = (s: Screen) => {
    setFieldError(false);
    setScreen(s);
    setScreenKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setAnswer = <K extends keyof UserAnswers>(key: K, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (fieldError) setFieldError(false);
  };

  const goToIfFilled = (value: string, next: Screen) => {
    if (!value.trim()) { setFieldError(true); shakeElement(primaryEl.current); return; }
    goTo(next);
  };

  const goToIfSelected = (value: string, next: Screen) => {
    if (!value) { setFieldError(true); shakeElement(primaryEl.current); return; }
    goTo(next);
  };

  // ── Start analysis in background ─────────────────────────────
  const startAnalysis = async (finalAnswers: UserAnswers) => {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalAnswers),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: AnalyzeResponse = await res.json();
      setResult(data);
      if (!data.isSpam && data.isQualified !== false) {
        trackEvent("QuizFinished", undefined, { service: finalAnswers.q1 });
      }
    } catch {
      setAnalyzeError(true);
    } finally {
      setApiDone(true);
    }
  };

  // ── After Q7: go to email gate ────────────────────────────────
  const handleQ7Answer = (q7Value: string) => {
    if (!q7Value) { setFieldError(true); shakeElement(primaryEl.current); return; }
    setAnswer("q7", q7Value);
    goTo("email-gate");
  };

  // ── Email gate submit ─────────────────────────────────────────
  const handleEmailGateSubmit = () => {
    let hasError = false;
    if (!capturedEmail || !capturedEmail.includes("@")) {
      setEmailGateError(true);
      shakeElement(emailGateRef.current);
      hasError = true;
    } else {
      setEmailGateError(false);
    }
    if (!capturedPhone.trim()) {
      setPhoneGateError(true);
      shakeElement(phoneGateRef.current);
      hasError = true;
    } else {
      setPhoneGateError(false);
    }
    if (hasError) return;
    // Fallback: send optin data immediately before AI generation
    fetch("/api/early-optin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: capturedEmail, phone: capturedPhone, answers, utm }),
    }).catch(() => {});
    startAnalysis({ ...answers });
    goTo("video");
  };

  // ── Video event handlers ──────────────────────────────────────
  const handleVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || v.seeking) return;
    lastValidTimeRef.current = v.currentTime;
    setVideoProgress(v.duration > 0 ? v.currentTime / v.duration : 0);
  };

  const handleVideoSeeking = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > lastValidTimeRef.current + 0.5) {
      v.currentTime = lastValidTimeRef.current;
    }
  };

  const handleVideoPlay = () => setIsPlaying(true);
  const handleVideoPause = () => setIsPlaying(false);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  // ── Enter key navigation ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      if (document.activeElement?.tagName === "BUTTON") return;
      switch (screen) {
        case "intro": goTo("q1"); break;
        case "q1": goToIfFilled(answers.q1, "q3"); break;
        case "q3": goToIfFilled(answers.q3, "q4"); break;
        case "q4": goToIfFilled(answers.q4, "q5"); break;
        case "q5": e.preventDefault(); goToIfFilled(answers.q5, "q6"); break;
        case "q6": goToIfSelected(answers.q6, "q7"); break;
        case "q7": handleQ7Answer(answers.q7); break;
        case "email-gate": handleEmailGateSubmit(); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen, answers, capturedEmail]);

  // ── Progress bar ──────────────────────────────────────────────
  const progressMap: Partial<Record<Screen, number>> = {
    q1: 50, q3: 55, q4: 60, q5: 65, q6: 70, q7: 75, "email-gate": 80, video: 85,
  };
  const currentPct = screen === "video" && resultVisible ? 95 : (progressMap[screen] ?? null);

  // ── Calendly URL ──────────────────────────────────────────────
  const calendlyUrl = (() => {
    const base = new URL("https://calendly.com/finally-freelancing-analysegespraech/ki-postionierung-erstgespraech");
    base.searchParams.set("hide_landing_page_details", "1");
    base.searchParams.set("hide_gdpr_banner", "1");
    base.searchParams.set("background_color", "ffffff");
    if (utm) Object.entries(utm).forEach(([k, v]) => { if (v) base.searchParams.set(k, v); });
    return base.toString();
  })();

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <Header />
      {currentPct !== null && <ProgressBar percent={currentPct} />}

      <div key={screenKey}>

        {/* ── Intro ── */}
        {screen === "intro" && (
          <div className="screen">
            <div className="intro">
              <div className="intro-badge"><BoltIcon /> Kostenfrei · 2 Minuten</div>
              <h1>Finde deine <em>Positionierung</em> als Freelancer</h1>
              <p>6 Fragen. Dein individueller Entwurf für eine Angebotsleiter, mit der du planbarer verkaufst und höhere Preise durchsetzt. Entwickelt für Selbstständige aus Design, Development und Marketing.</p>
              <div className="intro-features">
                <div><CheckIcon /> Stärken erkennen</div>
                <div><CheckIcon /> Angebotsleiter bauen</div>
                <div><CheckIcon /> Sofort umsetzbar</div>
              </div>
              <button className="btn-primary" onClick={() => goTo("q1")}>
                Jetzt starten
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div className="briefing-box">
                <div className="briefing-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </div>
                <div className="briefing-text"><strong>Je mehr Details, desto besser dein Ergebnis.</strong> Die KI generiert deine Positionierung auf Basis deiner Antworten — sei so konkret und spezifisch wie möglich.</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Q1 ── */}
        {screen === "q1" && (
          <div className="screen">
            <div className="question-title">Was ist deine Hauptdienstleistung?</div>
            <div className="question-sub">Die eine Sache, mit der du den Großteil deines Umsatzes machst.</div>
            <input ref={setPrimaryRef as React.RefCallback<HTMLInputElement>} type="text" className={`input-text${fieldError ? " error" : ""}`} value={answers.q1} onChange={(e) => setAnswer("q1", e.target.value)} placeholder="z.B. Webdesign, Copywriting, Performance Marketing..." autoFocus />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo("intro")}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q1, "q3")}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q3 ── */}
        {screen === "q3" && (
          <div className="screen">
            <div className="question-title">Worin bist du besser als 90% deiner Mitbewerber?</div>
            <div className="question-sub">Dein unfairer Vorteil. Das, was dich wirklich unterscheidet.</div>
            <input ref={setPrimaryRef as React.RefCallback<HTMLInputElement>} type="text" className={`input-text${fieldError ? " error" : ""}`} value={answers.q3} onChange={(e) => setAnswer("q3", e.target.value)} placeholder="z.B. Branchenexpertise im E-Commerce, schnelle Umsetzung..." autoFocus />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo("q1")}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q3, "q4")}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q4 ── */}
        {screen === "q4" && (
          <div className="screen">
            <div className="question-title">Wer ist dein profitabelster Kundentyp?</div>
            <div className="question-sub">Branche + Rolle. Wer zahlt am meisten und macht am wenigsten Stress?</div>
            <input ref={setPrimaryRef as React.RefCallback<HTMLInputElement>} type="text" className={`input-text${fieldError ? " error" : ""}`} value={answers.q4} onChange={(e) => setAnswer("q4", e.target.value)} placeholder="z.B. E-Commerce-Unternehmer mit 1-5 Mio. Umsatz" autoFocus />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo("q3")}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q4, "q5")}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q5 ── */}
        {screen === "q5" && (
          <div className="screen">
            <div className="question-title">Welches konkrete Problem löst du für diese Kunden?</div>
            <div className="question-sub">Nicht was du tust, sondern welches Ergebnis du lieferst.</div>
            <input ref={setPrimaryRef as React.RefCallback<HTMLInputElement>} type="text" className={`input-text${fieldError ? " error" : ""}`} value={answers.q5} onChange={(e) => setAnswer("q5", e.target.value)} placeholder='z.B. "Meine Kunden haben zu wenig qualifizierte Leads..."' autoFocus />
            {fieldError && <div className="field-error-msg">Bitte füll dieses Feld aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo("q4")}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfFilled(answers.q5, "q6")}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q6 ── */}
        {screen === "q6" && (
          <div className="screen">
            <div className="question-title">Wie hoch ist dein aktueller Monatsumsatz?</div>
            <div className="question-sub">Grobe Einordnung reicht. Damit passen wir die Preisempfehlung an.</div>
            <div ref={setPrimaryRef as React.RefCallback<HTMLDivElement>} className={`range-options${fieldError ? " selection-error" : ""}`}>
              {REVENUE_OPTIONS.map((opt) => (
                <div key={opt} className={`range-chip${answers.q6 === opt ? " selected" : ""}`} onClick={() => { setAnswer("q6", opt); goTo("q7"); }}>{opt}</div>
              ))}
            </div>
            {fieldError && <div className="field-error-msg">Bitte wähle eine Option aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo("q5")}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => goToIfSelected(answers.q6, "q7")}>Weiter</button>
            </div>
          </div>
        )}

        {/* ── Q7 ── */}
        {screen === "q7" && (
          <div className="screen">
            <div className="question-title">Hast du ein klar definiertes Angebot mit festem Preis?</div>
            <div className="question-sub">Kein Stundensatz, sondern ein Paket oder Festpreis-Angebot.</div>
            <div ref={setPrimaryRef as React.RefCallback<HTMLDivElement>} className={`yesno-grid${fieldError ? " selection-error" : ""}`}>
              <div className={`yesno-card${answers.q7 === "ja" ? " selected" : ""}`} onClick={() => handleQ7Answer("ja")}>
                <div className="yesno-icon">✓</div>
                <div className="yesno-label">Ja</div>
                <div className="yesno-sub">Ich habe klare Pakete</div>
              </div>
              <div className={`yesno-card${answers.q7 === "nein" ? " selected" : ""}`} onClick={() => handleQ7Answer("nein")}>
                <div className="yesno-icon">✗</div>
                <div className="yesno-label">Nein</div>
                <div className="yesno-sub">Ich arbeite nach Stunden</div>
              </div>
            </div>
            {fieldError && <div className="field-error-msg">Bitte wähle eine Option aus.</div>}
            <div className="nav-row">
              <button className="btn-secondary" onClick={() => goTo("q6")}><ArrowLeft /> Zurück</button>
              <button className="btn-primary" onClick={() => handleQ7Answer(answers.q7)}>
                Weiter
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Email Gate ── */}
        {screen === "email-gate" && (
          <div className="screen">
            <div className="paywall-wrap" style={{ position: "relative", minHeight: "unset" }}>
              <div className="optin-box" style={{ margin: "2rem auto", maxWidth: 440 }}>
                <div className="optin-lock">
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="#e55d3c" strokeWidth="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" stroke="#e55d3c" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h3>Deine komplette Leiter freischalten</h3>
                <p>Erhalte alle 4 Stufen mit konkreten Angebotsvorschlägen und Preisempfehlungen, individuell für dich.</p>
                <div className="optin-form">
                  <input
                    ref={emailGateRef}
                    type="email"
                    value={capturedEmail}
                    onChange={(e) => { setCapturedEmail(e.target.value); setEmailGateError(false); }}
                    placeholder="Deine E-Mail-Adresse"
                    autoFocus
                    style={emailGateError ? { borderColor: "var(--highlight)" } : undefined}
                  />
                  {emailGateError && <div className="field-error-msg" style={{ marginTop: "-0.25rem" }}>Bitte gib eine gültige E-Mail ein.</div>}
                  <input
                    ref={phoneGateRef}
                    type="tel"
                    value={capturedPhone}
                    onChange={(e) => { setCapturedPhone(e.target.value); setPhoneGateError(false); }}
                    placeholder="Deine Telefonnummer"
                    style={phoneGateError ? { borderColor: "var(--highlight)" } : undefined}
                  />
                  {phoneGateError && <div className="field-error-msg" style={{ marginTop: "-0.25rem" }}>Bitte gib deine Telefonnummer ein.</div>}
                  <button className="btn-primary" onClick={handleEmailGateSubmit}>
                    Ergebnis generieren
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Video Screen ── */}
        {screen === "video" && (
          <div className="screen video-screen">

            {/* Step 1: Video */}
            <div className="vs-step-badge">Schritt 1 · Video ansehen</div>
            <h2 className="vs-title">Während dein Ergebnis erstellt wird …</h2>
            <p className="vs-sub">Schau kurz rein – dann erfährst du direkt, wie du deine Angebotsleiter umsetzt.</p>

            <div className="vs-player-wrap">
              <video
                ref={videoRef}
                src={VIDEO_URL}
                autoPlay
                muted
                playsInline
                onTimeUpdate={handleVideoTimeUpdate}
                onSeeking={handleVideoSeeking}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                className="vs-video"
              />
              <div className="vs-controls">
                <button className="vs-ctrl-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg>
                  )}
                </button>
                <div className="vs-progress-track">
                  <div className="vs-progress-fill" style={{ width: `${videoProgress * 100}%` }} />
                </div>
                <button className="vs-ctrl-btn" onClick={toggleMute} aria-label={isMuted ? "Ton an" : "Ton aus"}>
                  {isMuted ? (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M23 9l-6 6M17 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  ) : (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Connector arrow */}
            <div className="vs-connector">
              <svg width="20" height="32" fill="none" viewBox="0 0 20 32"><path d="M10 0v24M3 18l7 8 7-8" stroke="var(--highlight)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>

            {/* Step 2: Skeleton (always visible while waiting) */}
            <div className="vs-step-badge">Schritt 2 · Dein Ergebnis</div>

            {!resultVisible && (
              <div className="vs-skeleton-wrap">
                <div className="vs-skeleton-status">
                  <div className="vs-skeleton-status-dot" />
                  <span>
                    {apiDone && !analyzeError
                      ? "Fertig – schau das Video zu Ende …"
                      : "Deine Angebotsleiter wird generiert …"}
                  </span>
                </div>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="vs-skeleton-step">
                    <div className="vs-skeleton-dot" />
                    <div className="vs-skeleton-card">
                      <div className="vs-skel vs-skel--label" />
                      <div className="vs-skel vs-skel--heading" />
                      <div className="vs-skel vs-skel--line" />
                      <div className="vs-skel vs-skel--line vs-skel--short" />
                      <div className="vs-skel vs-skel--price" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Result (fades in when ready) */}
            <div ref={resultSectionRef} className={`vs-result-section${resultVisible ? " vs-result-visible" : ""}`}>
              {resultVisible && !analyzeError && result && (
                <ResultBlock result={result} utm={utm} calendlyUrl={calendlyUrl} />
              )}
              {resultVisible && analyzeError && (
                <div className="error-state">
                  <p>Die Analyse konnte nicht abgeschlossen werden.</p>
                  <a className="btn-primary" href="/start">Erneut versuchen</a>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Result Block (fully unlocked) ───────────────────────────

interface ResultBlockProps {
  result: AnalyzeResponse;
  utm: UtmParams;
  calendlyUrl: string;
}

function ResultBlock({ result, utm, calendlyUrl }: ResultBlockProps) {
  return (
    <>
      {/* <div className="vs-booking-cta">
        <div className="vs-booking-cta-text">
          <div className="vs-booking-cta-title">Deine Leiter ist fertig — lass uns sie gemeinsam umsetzen</div>
          <div className="vs-booking-cta-sub">Buche dir jetzt ein kostenfreies Analysegespräch und wir besprechen deine nächsten Schritte.</div>
        </div>
        <button onClick={scrollToCalendly} className="btn-primary vs-booking-cta-btn">
          Termin buchen
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div> */}

      <div className="result-header">
        <h2>Deine Positionierungsleiter</h2>
        <p>So könnte eine durchdachte Angebotsstruktur für dich aussehen.</p>
      </div>

      <div className="concept-box">
        <h3>Was ist eine Angebotsleiter?</h3>
        <p>Die meisten Freelancer verkaufen ein einziges Angebot und hoffen, dass der Kunde sofort Ja sagt. Das Problem: Der Kunde kennt dich nicht, vertraut dir nicht und hat keine Ahnung, ob du liefern kannst.</p>
        <p>Die Angebotsleiter löst das. Du baust 4 Stufen auf, die das Commitment des Kunden schrittweise erhöhen. Vom Kostenfreien Einstieg bis zur langfristigen Zusammenarbeit.</p>
        <div className="commitment-bar">
          <div className="commitment-seg">Kostenfrei</div>
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

      <div className="section-label">Dein persönlicher Entwurf</div>

      <div className="ladder">
        <div className="ladder-line" />
        {[
          { label: "Stufe 1 · Kostenfreier Einstieg", step: result.steps[0] },
          { label: "Stufe 2 · Fuß-in-die-Tür-Angebot", step: result.steps[1] },
          { label: "Stufe 3 · Hauptangebot", step: result.steps[2] },
          { label: "Stufe 4 · Retainer", step: result.steps[3] },
        ].map(({ label, step }, i) => (
          <div key={i} className="ladder-step visible">
            <div className="ladder-dot-wrap"><div className="ladder-dot" /></div>
            <div className="ladder-content">
              <div className="ladder-label">{label}</div>
              <div className="ladder-card">
                <h4>{step.title}</h4>
                <p>{step.description}</p>
                <div className="ladder-price">{step.price}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="result-cta">
        <h4>Wie es für dich jetzt weitergeht</h4>
        <p>Der Positionierungs-Check ist eine KI-basierte, automatisierte Auswertung. In einem persönlichen Gespräch können wir nochmal tiefer auf deine individuelle Situation eingehen, Fragen klären und konkrete nächste Schritte besprechen. Buche dir hier direkt einen Termin für ein kostenfreies Analysegespräch.</p>
        <div className="calendly-inline-widget calendly-wrap" data-url={calendlyUrl} style={{ minWidth: "320px", height: "700px" }} />
        <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
      </div>
    </>
  );
}
