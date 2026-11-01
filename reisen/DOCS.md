# Reisen

Persönliche Reiseorganisation direkt in Home Assistant. Die App erscheint als **Reisen** in der Seitenleiste
und ist auch in der HA-App auf dem Handy nutzbar.

## Funktionen (Version 0.3)
- Reiseübersicht mit Countdown, Titelbild, Zielen und Budget
- Buchungen für alle gängigen Verkehrsmittel, Unterkünfte, Restaurants und Aktivitäten
- Flughafen- und Airline-Suche mit automatischer Zeitzone
- Ablaufansicht: alles chronologisch nach Reisetagen
- Dokumente: PDFs und Bilder hochladen und direkt ansehen
- Aufgaben pro Reise mit Fälligkeit und Vorschlägen
- Karte mit allen Orten und Buchungen, Ortssuche über OpenStreetMap
- Tagesplanung: Orte per Drag & Drop auf Reisetage verteilen

## Internet
Kartenkacheln (CARTO) und Ortssuche (Photon/Nominatim von OpenStreetMap) benötigen Internet.
Die Suche läuft über die App (max. 1 Anfrage pro Sekunde, mit Zwischenspeicher).

## Optionen
| Option | Beschreibung |
|---|---|
| `default_currency` | Standardwährung für neue Reisen (ISO-Code, z. B. `EUR`) |
| `carto_api_key` | Optional. Schlüssel für die Kartenansicht „CARTO Voyager“. Leer = Standard-Karte von OpenStreetMap |

### CARTO-Schlüssel (optional)
Seit September 2026 liefert CARTO seine Karten nur noch mit Schlüssel aus. Der Schlüssel ist für private
Nutzung kostenlos (bis 5 Mio. Kachel-Abrufe pro Monat), ein Konto ist nicht nötig:
1. Auf https://carto.com/basemaps/apikey/ die E-Mail-Adresse eintragen und als nicht-kommerziell angeben
2. Den Schlüssel aus der E-Mail hier unter `carto_api_key` eintragen, speichern, App neu starten

## Daten & Backup
Alle Daten (Datenbank und Dateien) liegen im App-Speicher (`/data`) und sind in den normalen
Home-Assistant-Backups enthalten.

Alle HA-Benutzer sehen und bearbeiten alle Reisen.
