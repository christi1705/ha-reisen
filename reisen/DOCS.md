# Reisen

Persönliche Reiseorganisation direkt in Home Assistant. Die App erscheint als **Reisen** in der Seitenleiste
und ist auch in der HA-App auf dem Handy nutzbar.

## Funktionen (Version 0.2)
- Reiseübersicht mit Countdown, Titelbild, Zielen und Budget
- Buchungen für alle gängigen Verkehrsmittel, Unterkünfte, Restaurants und Aktivitäten
- Flughafen- und Airline-Suche mit automatischer Zeitzone
- Ablaufansicht: alles chronologisch nach Reisetagen
- Dokumente: PDFs und Bilder hochladen und direkt ansehen
- Aufgaben pro Reise mit Fälligkeit und Vorschlägen

## Optionen
| Option | Beschreibung |
|---|---|
| `default_currency` | Standardwährung für neue Reisen (ISO-Code, z. B. `EUR`) |

## Daten & Backup
Alle Daten (Datenbank und Dateien) liegen im App-Speicher (`/data`) und sind in den normalen
Home-Assistant-Backups enthalten.

Alle HA-Benutzer sehen und bearbeiten alle Reisen.
