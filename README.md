# Sotto 1.1.1 – Android-Studio-Projekt

Privates Tagebuch. Die App-Oberfläche liegt als Web-Dateien in `app/src/main/assets/www/`,
die native Hülle (Kotlin) in `app/src/main/java/app/sotto/diary/`.

## Öffnen und starten
1. Android Studio (Ladybug oder neuer) → **File → Open** → diesen Ordner `Sotto` wählen.
2. Beim ersten Öffnen lädt Android Studio Gradle 8.11.1 und alle Bibliotheken (Internet nötig, ein paar Minuten).
   Falls gefragt wird „Gradle Wrapper fehlt“: **OK / Use Gradle wrapper** bestätigen.
3. Handy per USB anschließen (Entwickleroptionen + USB-Debugging an) → grüner ▶ **Run**.

Auch der Debug-Build ist mit deinem Schlüssel signiert. Er installiert sich deshalb direkt über
Sotto 1.0.0 – alle Einträge bleiben erhalten.

## Fertige Datei für den Play Store
**Build → Generate Signed App Bundle or APK → Android App Bundle**
→ Keystore: `keystore/sotto-signing.p12`, Passwörter stehen in `keystore.properties`
→ Variante `release`. Ergebnis: `app/release/app-release.aab`.

Nur zum Verteilen ohne Store: dasselbe mit **APK** statt App Bundle.

## Sotto Pro in der Play Console einrichten
1. App in der Play Console anlegen, Paketname `app.sotto.diary`, erstes AAB in „Interner Test“ hochladen.
2. **Monetarisieren → Produkte → In-App-Produkte → Produkt erstellen**
   - Produkt-ID: `sotto_pro` (genau so)
   - Name: Sotto Pro, Preis: 12,99 € (Einführung 9,99 €)
3. Unter **Einstellungen → Lizenztests** deine Google-Mail eintragen, dann kannst du kostenlos testen.
4. Solange die App nicht über Play installiert ist, zeigt der Kauf „Google Play ist gerade nicht erreichbar“ – das ist normal.

Ohne Google Play (z. B. im Browser) schaltet die Web-Oberfläche Pro wie in der Testversion frei.

## Was die Hülle kann
- Lädt die Oberfläche sicher über `https://appassets.androidplatform.net` (kein Internet nötig, keine INTERNET-Berechtigung).
- Speichert die verschlüsselte Datenbank zusätzlich in `filesDir/kammer-db.json` (wie bisher).
- Fotos auswählen, PDF/Sicherung/Text in **Downloads/Sotto** speichern und teilen.
- Google Play Billing für `sotto_pro`, „Kauf wiederherstellen“.
- Tägliche Erinnerung (zeigt nur „Wie war dein Tag?“, nie Tagebuch-Inhalte), übersteht Neustarts.
- Zurück-Taste schließt erst Fenster und Unterseiten, dann die App.

## Neu in 1.1.1
- Bessere Lesbarkeit: dunklere Schrift- und Akzentfarben in den hellen Designs Papier und Sepia (Kontrast nach WCAG AA).
- Neue PINs brauchen mindestens 6 Ziffern. Bestehende PINs funktionieren weiter.
- Schreibfeld und Suche haben Beschriftungen für Screenreader, größere Tippflächen bei „Andere Frage“ und Schlagworten.

## Wichtig
- `keystore/` und `keystore.properties` niemals veröffentlichen oder auf GitHub hochladen (stehen in `.gitignore`).
  Ohne diesen Schlüssel kannst du keine Updates mehr ausliefern – zusätzlich sicher aufbewahren.
- Für den Store-Eintrag brauchst du eine Datenschutzerklärung als Webseite (Inhalt: siehe „Impressum & Hinweise“ in der App).
