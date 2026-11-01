# Changelog

## 0.3.2
- Fix: OpenStreetMap-Karte wurde blockiert („Access blocked“), weil HA keinen Referer mitsendet.
  Kacheln werden jetzt über die App geladen und 30 Tage zwischengespeichert (gemäß OSM Tile Usage Policy).

## 0.3.1
- Karte funktioniert ohne Schlüssel: Standard-Karte von OpenStreetMap
- Neue Option `carto_api_key` für die Kartenansicht CARTO Voyager (CARTO verlangt seit 09/2026 einen Schlüssel)

## 0.3.0 – Etappe 2: Karte & Planung
- **Interaktive Karte** (OpenStreetMap / CARTO Voyager): Orte, Unterkünfte, Restaurants, Aktivitäten, Flugbögen und Bahn-/Autostrecken; Ebenen ein-/ausblendbar
- **Ortssuche** über OpenStreetMap (Photon, Fallback Nominatim) – im Planungs-Reiter, in Buchungen und bei den Reisezielen
- Neuer Reiter **Planung**: Orte sammeln (ungeplant), nach Kategorie filtern, per **Drag & Drop** auf Tage verteilen und sortieren
- Tagesrouten in Tagesfarben auf der Karte, Tag antippen = auf der Karte hervorheben
- **Ablauf** zeigt jetzt auch geplante Orte, am Desktop mit Karte daneben
- Orte bearbeiten: Kategorie, Tag, Uhrzeit, Link, Notizen, Position neu suchen

## 0.2.1
- Vorschläge für Aufgaben auf 5 reduziert: Flug, Hotel, Mietwagen, Parkplatz, Bahnanreise buchen

## 0.2.0 – Aufgaben
- Neuer Reiter **Aufgaben** pro Reise: abhaken, Fälligkeitsdatum, Notiz, bearbeiten
- Schnellauswahl für Fälligkeit („Heute“, „1 Woche vorher“, „Tag vor Abreise“)
- Vorschläge für typische Reise-Aufgaben mit passendem Fälligkeitsdatum
- Überfällige Aufgaben rot markiert, Anzahl offener Aufgaben in Übersicht und Kennzahlen
- Bessere Darstellung der Reiter auf dem Handy

## 0.1.0 – Etappe 1
- Reisen anlegen, bearbeiten, archivieren, löschen; Titelbild
- Buchungen: Flug, Zug, Bus, Schiff, Auto, Taxi, Mietwagen, Fahrrad, Unterkunft, Restaurant, Aktivität
- Flughafen- und Airline-Suche (offline), Zeitzonen pro Termin
- Chronologische Ablaufansicht nach Tagen
- Anhänge mit Vorschau für PDF und Bilder
