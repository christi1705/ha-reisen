# Reisen – Reiseorganisation für Home Assistant

Eine schlanke, persönliche Reiseplanung als Home-Assistant-App (Add-on) mit eigenem Eintrag in der Seitenleiste.
Inspiriert von [Surmai](https://surmai.app/) (Übersichtlichkeit) und [TREK](https://liketrek.com/) (Design, Karte).

## Installation
1. In Home Assistant: **Einstellungen → Apps → App Store → ⋮ → Repositories**
2. `https://github.com/christi1705/ha-reisen` hinzufügen
3. **Reisen** installieren, starten, „In Seitenleiste anzeigen“ aktivieren

## Etappen
- [x] **Etappe 1:** Reisen, Buchungen, Ablaufansicht, Dokumente
- [x] **Aufgaben** pro Reise (aus Etappe 3 vorgezogen)
- [x] **Etappe 2:** Karte, Ortssuche, Orte-Sammlung, Tagesplanung per Drag & Drop
- [ ] **Etappe 3:** Notizen, Ausgaben, HA-Sensoren & Kalender

## Entwicklung
```bash
# Backend
cd reisen/backend && pip install -r requirements.txt
REISEN_DATA_DIR=./.data uvicorn app.main:app --port 8099 --reload
# Frontend (Proxy auf :8099)
cd reisen/frontend && npm install && npm run dev
```
Referenzdaten neu erzeugen: siehe `reisen/tools/build_refdata.py`.

## Lizenzen der Daten
- Flughäfen: [airportsdata](https://github.com/mborsetti/airportsdata) (MIT)
- Airlines: [OpenFlights](https://openflights.org/data) (ODbL)
