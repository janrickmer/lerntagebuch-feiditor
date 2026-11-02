# Feiditor – Hinweise für die Entwicklung

- **Eine Engine für dreizehn Feiditoren:** Das große Skript („EINE Engine für alle Feiditoren“) ist byte-identisch
  im normalen Feiditor (janrickmer/feiditor), im Lerntagebuch-Feiditor (janrickmer/lerntagebuch-feiditor) und in
  den in die elf Escape-Rooms eingebetteten Feiditoren (janrickmer/escape-room-* sowie janrickmer/BSO-JG11 und
  janrickmer/Q3-PoWi-Konfliktanalyse-im-H-rtetest). Änderungen als exakte Ersetzungen in alle dreizehn Dateien
  einspielen und prüfen. Unterschiede nur über `window.FEIDITOR_CONFIG` (vor
  der Engine) oder eigene Skripte danach.
- **Auswertung für Lehrkräfte:** ausschließlich „Check des Feind(t)es“ (check.janrickmer.de, Repository
  janrickmer/check-des-feind-t-es mit ausführlicher `CLAUDE.md`). Im Feiditor gibt es keinen Lehrkraft-Zugang.
- **Nutzdaten** (`%TRACKDATA`, AES-GCM): `t`, `m`, `f`, `k`, `v: 2` (Längen in UTF-16-Einheiten), `z` (1 =
  Zwischenstand, 0 = fertige Abgabe); im Escape-Modus `e = {esc, red, ctx}` – `ctx` ist der Steckbrief des
  Escape-Rooms (Jahrgangsstufe, Inhalte) aus `window.__ESCAPE_DATA__.ctx` bzw. `%ESCAPEDATA` (Feld `c`).
- **Eine Datei für Moodle:** Die fertige Abgabe im Escape-Modus heißt „Abgeschlossener Escape-Room von Vorname
  Nachname.pdf“ (`makePdfName()`) und enthält vorne Aufgaben und Antworten, hinten die Überblicksseiten des
  Escape-Rooms. Der eingebettete Feiditor erzeugt sie aus `window.__ESCAPE_DATA__.overview` (`buildOverviewPages`);
  der eigenständige Feiditor übernimmt sie aus der hochgeladenen Überblick-PDF bzw. Zwischenstand-PDF
  (`overviewStreamsFrom()`: alle Seiten der Überblick-PDF, in Feiditor-PDFs die mit `%ESCAPE-OVERVIEW` markierten
  Content-Streams) und hängt sie unverändert an (`buildPdf`, `opts.overviewStreams`).
- **Live für Schüler:innen** (Branch `main`): vor jedem Push mit echten Dateien im Check testen.
- **Lerntagebuch = Feibeitsblatt-Oberfläche auf der Engine** (seit November 2026): Die Seite funktioniert wie ein
  Feibeitsblatt (janrickmer/feibeitsblatt) ohne Code und ohne Server – Angaben (Vorname, Nachname, Klasse; nur
  Einzelarbeit) → fünf Aufgaben → „Lerntagebuch-PDF herunterladen“ → Datei bei Moodle hochladen. Keine Online-Abgabe,
  keine Lehrkraft-Ansicht, kein KI-Feedback, keine Formatierungsleiste. Aufbau von `index.html`:
  - Oben die neue Oberfläche (`.view`-Bildschirme `#lb-start`, `#lb-editor`, `#lb-done`, Dialog `#lb-dlg`; Design und
    Bausteine aus dem Feibeitsblatt), darunter `#feiditor-engine-dom` (`hidden`, `inert`) mit der alten Oberfläche der
    Engine – **nicht entfernen**: Die Engine spricht diese Elemente beim Laden an und bricht ohne sie ab. Die Klasse
    `.screen` gehört nur dort hin (die Engine schaltet mit `show()` alle `.screen` um).
  - Dann `FEIDITOR_CONFIG` (fünf Fragen in `prefill`, Dateiname `pdfName`), die **Engine byte-identisch**, zuletzt das
    eigene Skript (IIFE im Strict-Modus – nie Namen der Engine auf oberster Ebene neu deklarieren: `$`, `recs`, `show` …).
  - Das Skript nutzt von der Engine nur `buildPayload` (dafür `recs` setzen, `escapeMode = false`), `aesEncrypt`, `_kf`,
    `buildPdf`, `pdfMarker`, `readAsBinaryStr`, `autoDecrypt`, `downloadBlob`, `CFG.pdfName`, `interimPdfName`.
- **Hintergrunddaten wie bisher (Pflicht für den Check):** `serializeAnswers()` baut `t`/`f`/`k` genau wie früher
  `serializeEditor()` den Lerntagebuch-Editor: je Frage ein Aufgabenblock (Art 1, Systemtext `s`, Format-Bits 17, Text
  wörtlich aus `prefill` – der Check erkennt Lerntagebücher an diesen Fragen), bei Frage 1 mit der Datumszeile
  „Wochentag, TT.MM.JJJJ“ im selben Block (der Check liest das Datum dort), dahinter je Antwortzeile ein Block (Art 0;
  die Antwort auf Frage 1 ist immer leer); Trenner „\n“ neben Aufgabenblöcken als Systemtext (Bits 16), zwischen
  Antwortzeilen der getippte Zeilenumbruch. Keine weiteren Systemzeilen (Name, Klasse, Überschrift) und nie
  „Aufgabe N“ in `t` – sonst färbt der Check sie rot bzw. hält die Datei für einen Escape-Room. Zusätzliche Felder
  `ltb: 1` (Kennung – nur solche Zwischenstände lassen sich laden; ältere Lerntagebuch- und andere Feiditor-PDFs
  nicht) und `kl` (Klasse); der Check verwirft unbekannte Felder. Klasse nur sichtbar im PDF-Kopf („Name · Klasse 8b“).
  Dateiname unverändert `Lerntagebucheintrag_Vorname_Nachname_TTMMJJJJ.pdf`, Zwischenstand wie bisher.
  **Zwischenstand-PDF ohne Hochlade-Auftrag** (Entscheidung des Betreibers): `buildPdf` der Engine setzt auf jede PDF
  „Bitte diese PDF-Datei herunterladen und bei Moodle hochladen.“; `stripMoodleNote()` nimmt den roten Textblock beim
  Zwischenstand wieder heraus (Content-Stream, `/Length` und Querverweise neu; Kopf mit `%TRACKDATA`, übrige Objekte
  und Trailer unverändert; passt der Aufbau nicht genau, bleibt die PDF unverändert). Die fertige PDF behält den Hinweis.
- **Tippzeiten:** je Antwortfeld `ta._tt` (Messkern aus dem Feibeitsblatt: `ttDiff`/`ttNew`/`ttApply`, Zeitpunkt
  `performance.now()` im Capture-Listener `input`, Rückgängig holt Zeiten zurück); `gapsOf` liefert je UTF-16-Einheit
  den Abstand zum vorigen Zeichen in ms (ganzzahlig, ungedeckelt wie in der Engine; -1 = unbekannt bzw. erstes Zeichen;
  zweite Hälfte eines Emojis wie die erste), übergeben als `g` in `recs`. Aus einer geladenen Zwischenstand-PDF werden
  die gespeicherten Abstände übernommen. Kein Widerspruchs-Schalter (Entscheidung des Betreibers); Hinweis in
  `impressum.html`, Abschnitt 5.
- **Download-Regel:** „Lerntagebuch-PDF herunterladen“ erst, wenn das Datum gewählt ist, die Aufgaben 2–5 beantwortet
  sind und alle Antworten zusammen mindestens 60 Wörter haben (`MIN_WORDS`, Vorgabe aus dem Infokasten); sonst Meldung
  und Fokus aufs erste fehlende Feld (Knopf `aria-disabled`, bleibt bedienbar). Unverändert erneut herunterladen liefert
  byte-genau dieselbe Datei (der Check erkennt sie als Doppel); nach einer Änderung entsteht eine neue. Zwischenstand
  jederzeit. Nichts im Browser speichern (kein localStorage – Tippzeiten im Speicher des Browsers bräuchten nach Annahme
  des Betreibers eine Einwilligung nach § 25 TDDDG); `beforeunload` warnt, solange etwas nicht heruntergeladen ist.
- **Einfügesperre und Rechtschreibprüfung** wie im Feibeitsblatt (Schichten `paste`/`drop`/`beforeinput`/`input`-Netz;
  LanguageTool nur auf Klick, Altersdialog `ltConsent` als Selbstauskunft, Ergebnis wird nur angezeigt). CSP als
  `<meta>`: `connect-src` nur `https://api.languagetool.org`.
- **Tests:** `CHECK_HTML=<Pfad zur index.html des Checks> node test/e2e.mjs` (Playwright/Chromium; LanguageTool
  nachgestellt) spielt den Ablauf durch und wertet die PDFs mit `analyzeFile` des Checks aus (`test/check-harness.mjs`).
  Nach jeder Änderung der Engine auch hier laufen lassen.
