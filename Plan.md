# MISSION
Konvertiere das bereitgestellte `index.html` (Positionierungs-Check) in eine moderne Next.js App (App Router, TypeScript). Das Ziel ist es, die statische Logik durch ein leistungsfähiges Backend zu ersetzen, um dynamische KI-Inhalte zu generieren, präzises Facebook-Tracking (CAPI) zu ermöglichen und Leads an externe Systeme zu senden.

# TECHNISCHER STACK
- Framework: Next.js (App Router)
- Sprache: TypeScript
- Styling: Extrahiere das vorhandene CSS 1:1 in eine `globals.css` oder CSS-Module. Verändere das Design NICHT.
- Backend: Next.js API Routes (Route Handlers)

# SCHRITTE ZUR UMSETZUNG (AUTONOM DURCHFÜHREN)

### 1. Projekt-Setup & UI Migration
- Erstelle die notwendige Ordnerstruktur.
- Migriere das HTML in eine React-Komponentenstruktur (`components/` für Header, ProgressBar, QuizSteps, ResultScreen).
- Nutze React `useState` für das State-Management der Benutzerantworten.
- Stelle sicher, dass alle Animationen (@keyframes) und Schriften (Playfair Display, DM Sans) erhalten bleiben.

### 2. Dynamische Positionierung (Backend-Integration)
- Erstelle einen API-Endpoint `/api/analyze`.
- Verschiebe die Logik der "Angebotsleiter" (die 4 Stufen) vom Frontend ins Backend.
- Bereite den Endpoint so vor, dass er die User-Inputs empfängt. Implementiere einen Platzhalter für einen Claude-API-Aufruf (Anthropic SDK), um basierend auf den Antworten (Hauptdienstleistung, USP, Zielgruppe, Problem) die 4 Stufen individuell zu texten.
- Die Antwort des Backends soll die Struktur der `ladder-steps` (Titel, Beschreibung, Preisempfehlung) dynamisch füllen.

### 3. Facebook Tracking & Event-Deduplizierung
- Implementiere ein Tracking-System, das sowohl Browser-Events (Meta Pixel) als auch Server-Side Events (Conversion API) nutzt.
- Generiere eine eindeutige `event_id` im Frontend für jeden Durchlauf, um Deduplizierung zu ermöglichen.
- Sende Events wie `PageView`, `QuizComplete` und `Lead` (beim Opt-in) sowohl via `fbq` (Browser) als auch über den `/api/track`-Endpoint (Server).

### 4. Lead-Management & System-Weiterleitung
- Erweitere die `unlockResult`-Funktion. Wenn der User seine E-Mail/Telefonnummer eingibt:
  - Sende die Daten an einen neuen Endpoint `/api/submit-lead`.
  - Dieser Endpoint soll die Daten validieren und einen Platzhalter für die Weiterleitung an ein CRM oder Automatisierungstool (z.B. Make/Zapier) enthalten.

### 5. Spam Schutz
- Stelle sicher, dass der Backend Endpoint, der die Daten mit Claude verarbeiten lässt nicht ausgenutzt bzw. Spam Attackt werden kann, was meine Kosten verbrennen würde.

### 6. Konfiguration (Environment Variables)
- Lege eine `.env.example` Datei an mit folgenden Platzhaltern:
  - `ANTHROPIC_API_KEY`
  - `FB_PIXEL_ID`
  - `FB_ACCESS_TOKEN`
  - `LEAD_WEBHOOK_URL`

### 7. Beispielstruktur der Daten von Claude
- Gib anhand der Implementation bzw. Anforderungen eine Beispielstruktur der Daten, die von Claude kommen sollen, vor, damit es keine Brüche in der Funktionalität gibt. Stelle sicher, dass diese Anforderungen stets eingehalten werden.

# REGELN
- Verändere das visuelle Design oder die User Experience nicht.
- Arbeite autonom: Triff technische Entscheidungen (wie Ordnerstrukturen) selbstständig im Sinne von Best Practices.
- Nutze TypeScript Interfaces für alle Datenstrukturen (UserAnswers, PricingResult, etc.).

# START
Beginne jetzt mit der Analyse des bereitgestellten Codes und starte mit dem Projekt-Setup.