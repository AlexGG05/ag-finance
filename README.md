# AG Finance

Finanzplaner mit E-Mail-Konten und gemeinsamen Haushalten. Deutsche, responsive Oberfläche für Einnahmen, Ausgaben, Monatsbudgets und Sparziele.

## Funktionen

- Registrierung mit einmaligem Bestätigungslink (24 Stunden), Login und Abmeldung.
- Passwort-Reset per einmaligem Link (1 Stunde). Ein Reset beendet alle bestehenden Sitzungen.
- Mehrere Haushalte, Umschalten zwischen Haushalten und Einladungen an eine konkrete E-Mail-Adresse (7 Tage).
- Inhaber lädt Mitglieder ein und entfernt sie. Alle Mitglieder sehen und bearbeiten dieselben Finanzdaten. Jeder Serverzugriff prüft die Mitgliedschaft.
- SQLite speichert Konten und Haushalte dauerhaft auf dem Server. Andere Mitglieder erhalten Änderungen nach spätestens etwa 5 Sekunden bei geöffneter App. Versionsprüfung verhindert das unbemerkte Überschreiben gleichzeitiger Änderungen; bei Konflikten werden aktuelle Daten geladen und die Änderung muss wiederholt werden.
- Monatsübersicht, 6-Monats-Vergleich, Buchungssuche, Budgets, Sparziele und JSON-Export/Import pro Haushalt. Neue Haushalte starten ohne Demobuchungen.

## Docker Compose in Arcane

Das Image wird von GitHub Actions als `ghcr.io/alexgg05/ag-finance` gebaut. Auf dem Arcane-Host sind weder Node.js noch ein lokaler Build nötig. Unterstützt werden Linux AMD64 und ARM64.

### Einmalig auf GitHub vorbereiten

1. Repository-Dateien einschließlich `.github/workflows/docker-publish.yml`, `Dockerfile` und Lockfile auf den Branch `main` übertragen. Unter **Actions** den Workflow aktivieren, falls GitHub danach fragt.
2. Nach einem Push auf `main` führt die Action Syntax-, Server- und Browsertests aus und veröffentlicht bei Erfolg das Image mit den Tags `latest` und `sha-<kurzer-commit>`. Tags wie `v1.0.0` erzeugen zusätzlich `1.0.0`. Pull Requests führen nur Tests aus. Der Workflow kann auch manuell gestartet werden.
3. Im Repository unter **Packages** kontrollieren, dass das Image veröffentlicht wurde. Für Pulls ohne Anmeldung das Paket in dessen Einstellungen auf **Public** stellen. GitHub legt neue Pakete zunächst häufig privat an; die Action ändert diese Sichtbarkeit nicht.
4. Für ein privates Paket stattdessen in Arcane einen Registry-Zugang für `ghcr.io` hinterlegen: GitHub-Benutzername und ein PAT (classic) mit `read:packages`, der Zugriff auf das Paket hat (bei Organisationen gegebenenfalls SSO freigeben). Alternativ auf dem Docker-Host `docker login ghcr.io` verwenden. Das Workflow-`GITHUB_TOKEN` wird automatisch bereitgestellt; dafür ist kein zusätzliches Repository-Secret nötig.

Die Dateien sind vorbereitet; ein lokaler Build veröffentlicht noch kein GHCR-Paket. Der erste erfolgreiche Workflow-Lauf auf GitHub ist Voraussetzung für das folgende Deployment.

### Stack in Arcane anlegen

1. Einen Compose-Stack bzw. ein Projekt `ag-finance` anlegen und die folgende Compose-Datei einfügen. Dieselbe Vorlage liegt in [`compose.yaml`](compose.yaml).
2. In Arcane die Variablen `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER` und `SMTP_PASS` hinterlegen; Beispiele stehen in [`.env.example`](.env.example). SMTP-Zugangsdaten nur dort setzen. `APP_URL` muss die tatsächliche öffentliche HTTPS-Adresse ohne abschließenden Pfad sein, zum Beispiel `https://finanzen.example.de`.
3. Einen HTTPS-Reverse-Proxy auf den Dienstport 3000 richten. Die App spricht intern HTTP; der Proxy beendet TLS. Browserzugriffe müssen über genau die konfigurierte `APP_URL` erfolgen, damit Sitzungen und Origin-Prüfung funktionieren.
4. Das Image ziehen und den Stack bereitstellen. Auf den Status **healthy** warten, die öffentliche Adresse öffnen, registrieren und den Bestätigungslink aus der echten E-Mail testen. Anschließend eine zweite Person zum Haushalt einladen.

```yaml
services:
  ag-finance:
    image: ghcr.io/alexgg05/ag-finance:${IMAGE_TAG:-latest}
    restart: unless-stopped
    init: true
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${HOST_PORT:-3000}:3000"
    environment:
      NODE_ENV: production
      PORT: "3000"
      DATA_DIR: /data
      APP_URL: "${APP_URL:?Öffentliche HTTPS-Adresse setzen}"
      SMTP_HOST: "${SMTP_HOST:?SMTP-Server setzen}"
      SMTP_PORT: "${SMTP_PORT:-587}"
      SMTP_FROM: "${SMTP_FROM:?Verifizierte Absenderadresse setzen}"
      SMTP_USER: "${SMTP_USER:-}"
      SMTP_PASS: "${SMTP_PASS:-}"
    volumes:
      - finance-data:/data
    read_only: true
    tmpfs:
      - /tmp:size=16m,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    stop_grace_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  finance-data:
```

Standardmäßig ist der Host-Port nur an `127.0.0.1` gebunden, passend für einen Reverse Proxy direkt auf dem Docker-Host. Arcane selbst richtet keine HTTPS-Domain für die App ein.

Läuft dein Reverse Proxy ebenfalls als Container, verbinde ihn und `ag-finance` mit demselben vorhandenen Docker-Netzwerk. Ergänze beim Service `ag-finance` `networks: [proxy]` und unten auf oberster Ebene:

```yaml
networks:
  proxy:
    external: true
    name: proxy  # tatsächlicher Name deines vorhandenen Proxy-Netzwerks
```

Im Proxy dann `http://ag-finance:3000` als Ziel verwenden. Die `ports`-Zuordnung kann in diesem Fall entfernt werden. Für einen Proxy auf einem anderen Rechner `BIND_ADDRESS` gezielt auf die LAN-Adresse des Docker-Hosts setzen und dessen Firewall passend konfigurieren. `HOST_PORT` ändert nur den veröffentlichten Host-Port; der Dienst im Container bleibt auf 3000.

### Updates, Daten und Backups

- `IMAGE_TAG=latest` folgt erfolgreichen Builds von `main`. Für nachvollziehbare Deployments einen festen Release-Tag wie `1.0.0` oder `sha-<kurzer-commit>` verwenden. Noch nicht veröffentlichte Tags können nicht gezogen werden.
- In Arcane nach einem neuen Image **Pull/Update** und anschließend **Redeploy** ausführen. Ein Container-Neustart allein lädt kein neues Image. Auf der Kommandozeile entspricht das `docker compose pull && docker compose up -d`.
- Das Named Volume `finance-data` enthält SQLite-Datenbank, Konten und Haushalte unter `/data`. Container können ersetzt werden, ohne Daten zu löschen. Stack-Projektname und Volume beibehalten; beim Entfernen des Stacks das Volume nicht mitlöschen (`docker compose down -v` würde es löschen).
- Für ein konsistentes vollständiges Backup den Stack stoppen, das Volume über die Backup-Funktion deines Hosts sichern und danach wieder starten. Vor Updates sichern. Beim Wiederherstellen auch Dateieigentümer beibehalten: Der Container läuft als Benutzer `node` (UID/GID 1000). Finanzdaten-Exporte aus der App ersetzen kein vollständiges Datenbankbackup.
- Nur eine App-Instanz mit diesem lokalen SQLite-Volume betreiben. Keine unabhängigen Replikate auf dasselbe Volume skalieren.
- Der Healthcheck prüft, ob die App HTTP-Anfragen beantwortet; er bestätigt keine SMTP-Zustellung. Bei `unhealthy` oder Neustartschleifen die Container-Logs prüfen, insbesondere HTTPS-`APP_URL`, SMTP-Pflichtfelder und Schreibrechte auf `/data`.

Optional lokal dieselbe Konfiguration verwenden:

```sh
cp .env.example .env
# .env mit echter Domain und SMTP-Konfiguration ausfüllen
# Bei privatem Paket vorher docker login ghcr.io

docker compose config --quiet
docker compose pull
docker compose up -d
```

`.env` ist Git-ignoriert. Bei der lokalen `.env` Werte mit Sonderzeichen wie `$` oder `#` in einfache Anführungszeichen setzen, damit Compose sie wörtlich übernimmt. Das Image enthält keine Zugangsdaten, Entwicklungs-Postausgänge oder lokale Finanzdaten.

### Image bei Bedarf selbst bauen

```sh
docker build -t ag-finance:local .
```

In Netzwerken mit eigener Zertifizierungsstelle kann das öffentliche CA-Zertifikat während des Builds mit `--secret id=npm_ca,src=/pfad/ca.pem` eingebunden werden. Es wird nur für den Paketdownload verwendet und nicht im Image gespeichert; TLS-Verifikation bleibt aktiv. Netzwerk-Proxy-Parameter sind ausschließlich bei Bedarf als Docker-Build-Argumente zu übergeben.

## Lokal starten

Node.js 24 (wegen `node:sqlite`), npm und ein beschreibbares Datenverzeichnis sind erforderlich.

```sh
npm ci
npm start
```

Port 3000, alternativ `PORT=4000 npm start`. Ohne SMTP werden E-Mails nur für die Entwicklung in `.data/mail-outbox.jsonl` geschrieben. Links aus dieser serverseitigen Datei im Browser öffnen, um Bestätigung, Einladung oder Reset lokal zu testen. Die Datei enthält sensible Links und darf nicht veröffentlicht werden. Der Webserver stellt weder diese Datei noch die Datenbank bereit.

`npm run check` prüft die JavaScript-Syntax. `npm test` testet Registrierung, Bestätigung, Login, Einladungen, geteilte Daten, fremde Haushalte, Mitgliederentfernung, Versionskonflikte, Reset, Token-Wiederverwendung, Logout und fremde Origins. Tests verwenden ein temporäres Datenverzeichnis.

Browser-E2E: `npm run test:e2e` verwendet vorhandenes `/usr/bin/chromium`. Falls kein System-Chromium vorhanden ist, zuerst `npx playwright install chromium` ausführen. Der Test startet einen eigenen Server und benutzt ein temporäres Datenverzeichnis.

## Echte E-Mails und Betrieb

Umgebungsvariablen im Serverprozess setzen (keine Zugangsdaten in Git speichern):

| Variable | Verwendung |
| --- | --- |
| `APP_URL` | Öffentliche Basis-URL, im Betrieb zwingend HTTPS; auch für E-Mail-Links und Origin-Prüfung |
| `SMTP_HOST` | SMTP-Server des eigenen Mailanbieters |
| `SMTP_PORT` | 587 (STARTTLS) oder 465 (TLS) |
| `SMTP_USER` / `SMTP_PASS` | Mailanbieter-Zugangsdaten, sofern Authentifizierung nötig ist |
| `SMTP_FROM` | Verifizierte Absenderadresse |
| `DATA_DIR` | Persistentes, ausschließlich für den Server zugängliches Datenverzeichnis; Standard `.data` |
| `PORT` | Standard 3000 |
| `NODE_ENV` | Für Betrieb `production`; erzwingt HTTPS-APP_URL und Mailkonfiguration |

Passwörter werden mit scrypt und zufälligem Salt gehasht. Sitzungen und Einmallinks liegen nur gehasht in der Datenbank. Sitzungscookies sind HttpOnly, SameSite=Lax und bei HTTPS Secure. Auth-Endpunkte begrenzen Versuche pro Verbindungs-IP; für einen öffentlichen Betrieb zusätzlich ein passendes Rate-Limit am Reverse Proxy konfigurieren. TLS-Verifikation beim Mailversand bleibt aktiv, STARTTLS auf Port 587 ist verpflichtend.

Die Datenbank enthält private Finanzdaten. Nur hinter HTTPS betreiben, Datenverzeichnis auf dauerhaftem Volume halten und regelmäßig konsistente SQLite-Backups einschließlich aller Haushalte erstellen. JSON-Exports enthalten Finanzdaten eines einzelnen Haushalts, keine Konten, Mitgliedschaften oder Passwörter. Nicht als öffentlich freigegebenen Mehrbenutzerserver ohne eigene Betriebsprüfung behandeln. Der SMTP-Versand und eine öffentliche Bereitstellung benötigen eigene Infrastruktur und wurden ohne Mail-Zugangsdaten nicht getestet.

Sparziel-Einzahlungen sind manuelle Fortschrittsangaben und erzeugen keine Buchung. Budgets sind wiederkehrende monatliche Grenzen. Der Monatsüberschuss ist Einnahmen minus Ausgaben, kein Bankkontostand. Es gibt keine Bankenanbindung. Schriftarten werden optional von Google Fonts geladen; ohne Netzwerk greifen Systemschriften.

Die Gestaltung ist eigenständig; das angefragte AG-Fit-Repository war mit dem vorhandenen GitHub-Zugriff nicht lesbar. Die gewünschte Funktion gemeinsamer Haushalte ist hier für Finanzen umgesetzt.
