# Reiseorga für Home Assistant – Spezifikation

**Name:** Reisen
**Stand:** 01.11.2026 · Version 0.2
**Vorbilder:** Surmai (Übersichtlichkeit, Buchungstypen) · TREK (Design, Karte, Tagesplanung)

---

## 1. Ziel

Eine persönliche Reiseorganisation, die als eigene App (Add-on) in Home Assistant läuft. Sie hat einen eigenen Eintrag in der Seitenleiste und ist am Handy über die HA-App bzw. Nabu Casa erreichbar.
Der Funktionsumfang ist bewusst schlank: nur das, was ausgewählt wurde, und keine Funktionen für Gruppenreisen (Chat, Umfragen, Echtzeit-Präsenz).

### Im Umfang
- Reiseübersicht mit Zielen, Zeitraum und Titelbild
- Chronologische Ablaufansicht (Flug → Hotel → Aktivität)
- Tagesplanung: Orte per Drag & Drop auf Tage ziehen
- Sammlung von Orten (geplant / ungeplant, Filter nach Kategorie)
- Ortssuche über OpenStreetMap
- Interaktive Karte der ganzen Reise
- Notizen als Rich-Text mit Tabellen
- Buchungen: Flug (mit Flughafen- und Airline-Datenbank), Zug, Bus, Schiff, Auto/Taxi, Mietwagen, Fahrrad, Unterkunft, Restaurant, Aktivität/Ticket – jeweils mit Buchungsnummer und Status
- Anhänge pro Buchung oder Reise, mit Vorschau für PDF und Bilder
- Grobe Ausgaben (Summen pro Kategorie, optional mit Budget)
- Offene Aufgaben pro Reise
- Grundlagen: Reisen anlegen, bearbeiten, löschen und archivieren; Handy-Ansicht; Backup über HA

### Bewusst nicht im Umfang
Echtzeit-Zusammenarbeit, Chat und Umfragen, öffentliche Links zum Teilen, Packlisten-Vorlagen, Route optimieren, Wetter, Live-Flugstatus (macht ByAir), Ausgaben aufteilen (macht Splid), Offline-Modus, Atlas/Journey/Vacay, E-Mail-Import.
→ Kann später als Ausbaustufe dazukommen (siehe Abschnitt 9).

---

## 2. Architektur

```
┌──────────────────── Home Assistant OS ────────────────────┐
│                                                           │
│  Seitenleiste „Reisen“ ──Ingress──▶  App (Docker)         │
│                                    ├─ Backend  (API)      │
│                                    ├─ Frontend (SPA)      │
│                                    ├─ SQLite  /data/db    │
│                                    └─ Dateien /data/files │
│                                                           │
│  HA-Kern ◀── MQTT Discovery (Sensoren) ── App             │
│          ◀── ICS-Feed (Remote Calendar) ── App            │
└───────────────────────────────────────────────────────────┘
```

| Bereich | Wahl | Begründung |
|---|---|---|
| Laufzeit | HA-App (Add-on), amd64 | Wie Splid Bridge/Hearth; landet automatisch in HA-Backups |
| Login | HA Ingress | Kein eigener Login; der Benutzer kommt über die Header `X-Remote-User-Id/-Name` |
| Backend | Python 3.13 · FastAPI · SQLModel · SQLite | Leichtgewichtig, eine Datei als Datenbank, gleiche Sprache wie HA |
| Frontend | React · TypeScript · Vite · Tailwind | Modernes, kartenbasiertes Design (angelehnt an TREK) |
| Karte | Leaflet (react-leaflet) + OSM-Kacheln (optional CARTO Voyager / Dark) | Frei, kein API-Schlüssel |
| Ortssuche | Photon (komoot) bzw. Nominatim, Abfragen über das Backend mit Cache | Frei; Nutzungsregeln einhalten (max. 1 Anfrage/s, User-Agent setzen) |
| Drag & Drop | dnd-kit | Gut auf Touch-Geräten |
| Rich-Text | TipTap (mit Tabellen-Erweiterung) | Notizen mit Tabellen |
| PDF-Vorschau | pdf.js; Bilder direkt | Läuft im Browser |
| Referenzdaten | OurAirports (Flughäfen), OpenFlights (Airlines) | Werden beim Bauen der App mitgeliefert, offline verfügbar |
| Zeitzonen | Pro Termin mit IANA-Zeitzone; bei Flughäfen aus den Referenzdaten | Abflug/Ankunft in Ortszeit |

**Wichtig wegen Ingress:** Das Frontend muss mit relativen Pfaden arbeiten (`base: './'`), und die API wird relativ aufgerufen. Sonst funktioniert die App unter `/api/hassio_ingress/<token>/` nicht.

---

## 3. Datenmodell

### Trip (Reise)
| Feld | Typ | Hinweis |
|---|---|---|
| id | UUID | |
| title | Text | |
| description | Text? | |
| start_date / end_date | Datum | Daraus ergeben sich die Tage |
| destinations | Liste aus {name, lat, lon, country_code} | Für die Kopfzeile und die Startansicht der Karte |
| cover_image | Datei? | Titelbild |
| currency | ISO-Code | Standard EUR |
| budget | Betrag? | Optional |
| archived | bool | |
| created_by, created_at, updated_at | | |

Der Status (*geplant / läuft / vorbei*) wird aus dem Datum berechnet.

### Place (Ort)
| Feld | Typ | Hinweis |
|---|---|---|
| id, trip_id | | |
| name, address | Text | |
| lat, lon | Zahl | |
| category | Enum | Sehenswürdigkeit, Essen, Natur, Shopping, Nachtleben, Unterkunft, Verkehr, Sonstiges |
| source_ref | Text? | OSM-ID |
| day | Datum? | `null` = ungeplant |
| sort_order | int | Reihenfolge innerhalb des Tages |
| time | Uhrzeit? | Optional |
| url, notes | Text? | |

### Booking (Buchung)
Eine gemeinsame Tabelle; die typspezifischen Felder stehen in `details` (JSON).

| Feld | Typ | Hinweis |
|---|---|---|
| id, trip_id | | |
| type | Enum | flight, train, bus, boat, car, taxi, rental_car, bike, lodging, restaurant, activity |
| title | Text | Wird automatisch vorgeschlagen, z. B. „LH 400 FRA → JFK“ |
| provider | Text? | Airline, Bahn, Hotel … |
| confirmation_code | Text? | Buchungsnummer |
| status | Enum | idee, gebucht, bestätigt, storniert |
| start_at / start_tz | Datum+Zeit / IANA | Abfahrt bzw. Check-in |
| end_at / end_tz | Datum+Zeit / IANA | Ankunft bzw. Check-out |
| from_location / to_location | {name, lat, lon, ref?} | Unterkunft, Restaurant und Aktivität haben nur einen Ort |
| cost / cost_currency | Betrag? | Zählt automatisch zu den Ausgaben |
| details | JSON | Siehe unten |
| notes | Text? | |

**`details` je nach Typ (Beispiele):**
- *flight:* airline_iata, flight_number, from_iata, to_iata, terminal, gate, seat, class, baggage
- *train/bus/boat:* operator, number, platform, car/coach, seat
- *rental_car:* pickup/dropoff location, vehicle, insurance
- *lodging:* room type, guests, board (Verpflegung), check-in/out times
- *restaurant/activity:* party size, ticket type

### Weitere Tabellen
- **Attachment:** id, trip_id, booking_id?, filename, mime, size, storage_path, uploaded_at
- **Note:** id, trip_id, title, content (TipTap-JSON), sort_order, updated_at
- **Expense:** id, trip_id, booking_id?, category (Anreise, Unterkunft, Essen, Mobilität vor Ort, Aktivitäten, Sonstiges), amount, currency, date, description
- **Task:** id, trip_id, title, done, due_date?, sort_order
- **Airport / Airline:** Referenzdaten, nur lesbar

**Regel für die Ausgaben:** Kosten einer Buchung werden automatisch als Ausgabe gezählt, damit nichts doppelt eingetragen werden muss. Einträge in anderer Währung werden nur grob umgerechnet: entweder mit einem manuell eingetragenen Kurs oder optional mit dem EZB-Kurs (frankfurter.app).

---

## 4. Ansichten

### 4.1 Reiseübersicht (Startseite)
- Karten-Kacheln mit Titelbild, Titel, Zeitraum, Zielen und Countdown („in 23 Tagen“)
- Abschnitte: **Läuft gerade** · **Kommend** · **Vergangen** · Archiv (eingeklappt)
- Schaltfläche „Neue Reise“

### 4.2 Reise-Detail
Kopfzeile mit Titelbild, Titel, Zeitraum, Zielen und Kennzahlen (Tage, Buchungen, Ausgaben gegenüber Budget, offene Aufgaben).
Reiter:

| Reiter | Inhalt |
|---|---|
| **Ablauf** | Chronologische Liste aller Buchungen und geplanten Orte, nach Tagen gruppiert. Am Desktop rechts die Karte; Klick auf einen Eintrag hebt ihn auf der Karte hervor. |
| **Planung** | Tagesspalten (am Handy untereinander) plus Spalte „Ungeplant“. Orte per Drag & Drop zwischen den Tagen verschieben und neu sortieren. Ortssuche und Kategorie-Filter. Karte mit Markern in der Farbe des Tages; Verbindungslinien zeigen die Reihenfolge. |
| **Buchungen** | Liste mit Filter nach Typ; Formular, das sich je nach Typ anpasst; Anhänge direkt an der Buchung |
| **Dokumente** | Alle Anhänge der Reise in einer Galerie bzw. Liste; Vorschau-Fenster für PDF und Bilder |
| **Notizen** | Mehrere Notizen pro Reise, Rich-Text-Editor mit Tabellen |
| **Ausgaben** | Summen pro Kategorie, Budgetbalken, Liste der Einträge |
| **Aufgaben** | Abhakbare Liste mit optionalem Fälligkeitsdatum |

### 4.3 Karte
- Zeigt alle Orte und Buchungsorte einer Reise
- Flüge als Bogenlinie, Fahrten am Boden als gerade Linie
- Ebenen ein- und ausblendbar: Orte · Unterkünfte · Verkehr
- Optional später: tatsächlich zurückgelegter Weg aus Dawarich

### 4.4 Design
- Angelehnt an TREK: großzügige Karten-Kacheln, abgerundete Ecken, kräftige Akzentfarbe, Symbole pro Buchungstyp
- Hell- und Dunkelmodus (richtet sich nach HA bzw. dem System)
- Sprache Deutsch, vorbereitet für weitere Sprachen
- Für das Handy zuerst gedacht (Tab-Leiste unten, Karte als Vollbild zum Umschalten)

---

## 5. Anbindung an Home Assistant

| Funktion | Umsetzung |
|---|---|
| Sensoren (MQTT Discovery über den vorhandenen Mosquitto) | `sensor.reise_naechste` (Titel, Attribute: Start, Ende, Ziele), `sensor.reise_countdown_tage`, `binary_sensor.reise_aktiv`, `sensor.reise_naechste_buchung` (z. B. nächster Flug mit Zeit) |
| Kalender | Die App stellt einen ICS-Feed bereit → in HA mit der Core-Integration **Remote Calendar** einbinden (Reisen als Ganztagstermine, Buchungen als Termine) |
| Aufgaben | Zunächst nur in der App. Später: Abgleich mit einer HA-Aufgabenliste über eine kleine eigene Integration (Ausbaustufe) |
| Automationen (Beispiele) | Urlaubsmodus, wenn `binary_sensor.reise_aktiv` an ist; Push am Vorabend des Abflugs; Erinnerung an offene Aufgaben 3 Tage vor der Abreise |

---

## 6. Schnittstellen (Backend-API, Auszug)

```
GET/POST        /api/trips
GET/PATCH/DEL   /api/trips/{id}
GET/POST        /api/trips/{id}/places
PATCH           /api/places/{id}              (u. a. day, sort_order)
POST            /api/trips/{id}/places/reorder
GET/POST        /api/trips/{id}/bookings
GET/PATCH/DEL   /api/bookings/{id}
POST            /api/attachments              (multipart, trip_id, booking_id?)
GET             /api/attachments/{id}/file
GET/POST/PATCH  /api/trips/{id}/notes | expenses | tasks
GET             /api/search/places?q=&near=
GET             /api/ref/airports?q=  ·  /api/ref/airlines?q=
GET             /api/trips/{id}/timeline
GET             /calendar.ics?token=…
```

---

## 7. Etappen

### Etappe 1 – Grundgerüst, Reisen und Buchungen
- Grundgerüst der App (config.yaml, Dockerfile, Ingress, Eintrag in der Seitenleiste)
- Datenbank mit Migrationen (Alembic)
- Reisen anlegen, bearbeiten, löschen, archivieren; Titelbild
- Buchungen mit allen Typen; Flughafen- und Airline-Suche
- Ablaufansicht (noch ohne Karte)
- Anhänge mit Vorschau

**Fertig, wenn:** eine echte Reise mit Flug, Hotel und Mietwagen inklusive PDF-Bestätigungen angelegt ist und sich am Handy über die HA-App öffnen lässt.

### Etappe 2 – Karte und Planung
- Ortssuche (Photon/Nominatim, über das Backend mit Cache)
- Orte-Sammlung mit Kategorien und Filter
- Tagesplanung per Drag & Drop
- Interaktive Karte in Ablauf und Planung, Flugbögen, Ebenen

**Fertig, wenn:** sich eine Städtereise mit 15 Orten auf 4 Tage verteilen lässt und die Karte sofort mitzieht.

### Etappe 3 – Notizen, Ausgaben, Aufgaben, HA-Anbindung
- Notizen (TipTap mit Tabellen)
- Ausgaben mit Kategorien und Budget
- Aufgaben
- MQTT-Sensoren und ICS-Feed
- Beispiel-Automationen

**Fertig, wenn:** in HA ein Countdown auf dem Dashboard steht und die Reise im Kalender auftaucht.

---

## 8. Entscheidungen

| Thema | Entscheidung (01.11.2026) |
|---|---|
| Name | **Reisen** (Slug `reisen`, Eintrag „Reisen“ in der Seitenleiste) |
| Ort für den Code | **GitHub-Repository**, Installation in HA als eigenes Add-on-Repository |
| Benutzer | **Alle sehen alles:** alle HA-Benutzer sehen und bearbeiten alle Reisen; `created_by` wird nur zur Info gespeichert |
| Karten-Stil | **CARTO Voyager** |
| Währungsumrechnung | Noch offen; Standard: manueller Kurs, EZB-Kurse optional in Etappe 3 |

---

## 9. Mögliche Ausbaustufen (später)
- Echte HA-Aufgabenliste pro Reise (Integration für den Abgleich)
- Dawarich-Weg auf der Karte („wo war ich wirklich“)
- Flug aus der App direkt in ByAir anlegen
- Buchungsbestätigungen per E-Mail importieren (wie bei Surmai)
- Export als PDF oder Ausdruck
- Packliste als Vorlage
- Wetter pro Tag (Open-Meteo)
- MCP-Schnittstelle, damit Claude Reisen lesen und bearbeiten kann
