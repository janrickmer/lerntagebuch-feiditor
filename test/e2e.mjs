// Ende-zu-Ende-Test des Lerntagebuch-Feiditors: Ablauf im Browser (Chromium über Playwright) und Auswertung der erzeugten
// PDF-Dateien mit dem Code von „Check des Feind(t)es“ (siehe check-harness.mjs).
// Aufruf: CHECK_HTML=<Pfad zur index.html des Checks> node test/e2e.mjs   (Playwright muss installiert sein)
// LanguageTool wird per page.route nachgestellt – es geht keine Anfrage ins Netz.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { analyze, summary, payloadOf, latin1, C, E } from "./check-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(ROOT, p === "/" ? "index.html" : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port;
const URL_ = ORIGIN + "/index.html";
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "ltb-e2e-"));
let fails = 0;
const ok = (cond, label, extra) => { if (cond) console.log("  ✓", label); else { fails++; console.log("  ✗", label, extra !== undefined ? JSON.stringify(extra) : ""); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, locale: "de-DE" });
await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
const page = await ctx.newPage();
const errs = [], ltReqs = [], otherReqs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("request", (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + "/") && !u.startsWith("blob:") && !u.startsWith("data:")) otherReqs.push(u); });
await page.route("https://api.languagetool.org/**", async (route) => {
  const body = route.request().postData() || ""; ltReqs.push(body);
  const text = new URLSearchParams(body).get("text") || "";
  const i = text.indexOf("Deomkratie");
  const matches = i >= 0 ? [{ offset: i, length: 10, message: "Möglicher Tippfehler", replacements: [{ value: "Demokratie" }], rule: { id: "GERMAN_SPELLER_RULE", category: { id: "TYPOS" } }, context: { text: text.slice(Math.max(0, i - 5), i + 15), offset: Math.min(5, i), length: 10 } }] : [];
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ matches }) });
});
async function download(trigger) { const [d] = await Promise.all([page.waitForEvent("download"), trigger()]); const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p); return { name: d.suggestedFilename(), bytes: new Uint8Array(fs.readFileSync(p)), path: p }; }

console.log("1. Start und Angaben");
await page.goto(URL_);
await page.click("#lb-start-btn");
ok((await page.textContent("#lb-start-err")) === "Bitte trage deinen Vornamen ein.", "leere Angaben → Meldung Vorname");
await page.fill("#lb-vorname", "Max_1"); await page.click("#lb-start-btn");
ok((await page.textContent("#lb-start-err")).includes("nur Buchstaben"), "Unterstrich im Vornamen abgelehnt");
await page.fill("#lb-vorname", "  Max  "); await page.fill("#lb-nachname", "Muster-Mann"); await page.fill("#lb-klasse", "8 b");
await page.press("#lb-klasse", "Enter");
await page.waitForTimeout(150);
ok(await page.isVisible("#lb-editor"), "Schreibbereich offen");
ok((await page.textContent("#lb-who")) === "Max Muster-Mann · Klasse 8b", "Name und Klasse in der Kopfzeile", await page.textContent("#lb-who"));
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "lb-date"), "Fokus auf dem Datum");

console.log("2. Download gesperrt, solange etwas fehlt");
await page.click("#lb-final", { force: true });
ok((await page.textContent("#lb-final-status")).startsWith("Die PDF-Datei lässt sich erst herunterladen"), "Meldung beim Klick ohne Inhalte");
ok(await page.getAttribute("#lb-final", "aria-disabled") === "true", "Knopf aria-disabled");
ok(await page.isVisible("#lb-editor"), "kein Abschlussbildschirm");

console.log("3. Datum");
await page.fill("#lb-date", "2099-01-01");
ok((await page.textContent("#lb-date-err")).includes("Zukunft"), "Datum in der Zukunft abgelehnt");
await page.fill("#lb-date", "2026-10-29");
ok((await page.textContent("#lb-date-out")) === "Donnerstag, 29.10.2026", "Wochentag angezeigt", await page.textContent("#lb-date-out"));

console.log("4. Einfügesperre");
await page.click("#lb-a-2");
await page.evaluate(() => { const dt = new DataTransfer(); dt.setData("text/plain", "Eingefügter Text aus dem Netz"); document.getElementById("lb-a-2").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
ok((await page.inputValue("#lb-a-2")) === "", "paste blockiert");
ok((await page.textContent("#lb-pe-2")).includes("nicht erlaubt"), "Hinweis zur Einfügesperre");
await page.keyboard.insertText("Das ist ein ganzer Satz aus der Zwischenablage einer Tastatur.");
ok((await page.inputValue("#lb-a-2")) === "", "großes insertText (Tastatur-Zwischenablage) blockiert", await page.inputValue("#lb-a-2"));
await page.evaluate(() => { const ta = document.getElementById("lb-a-2"); const dt = new DataTransfer(); dt.setData("text/plain", "gezogen"); ta.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); });
ok((await page.inputValue("#lb-a-2")) === "", "drop blockiert");

console.log("5. Tippen");
await page.type("#lb-a-2", "Wie funktioniert die Deomkratie in Deutschland?", { delay: 90 });
await page.type("#lb-a-3", "Wir haben die Gewaltenteilung besprochen.", { delay: 90 });
await page.press("#lb-a-3", "Enter");
await page.type("#lb-a-3", "Legislative, Exekutive und Judikative kontrollieren sich gegenseitig.", { delay: 80 });
await page.type("#lb-a-4", "Ich darf bald selbst wählen, deshalb ist das für mich wichtig.", { delay: 70 });
await page.type("#lb-a-5", "Wie unabhängig sind Gerichte wirklich", { delay: 85 });
await page.type("#lb-a-5", " und wer kontrolliert sie?", { delay: 5 });   // schnell → rot
const words1 = await page.textContent("#lb-words");
ok(/^Bisher \d+ Wörter/.test(words1), "Wortzähler unter 60", words1);
await page.click("#lb-final", { force: true });
ok((await page.textContent("#lb-final-status")).includes("Wörter (zusammen mindestens 60)"), "Sperre wegen < 60 Wörtern", await page.textContent("#lb-final-status"));

console.log("6. LanguageTool");
await page.click("#lb-t-2 .ltbtn");
await page.waitForSelector("#lb-dlg.open");
ok((await page.textContent("#lb-dlg-text")).includes("Learneo, Inc., USA"), "Altersdialog");
ok(await page.evaluate(() => document.activeElement.id === "lb-dlg-cancel"), "Fokus auf „Trifft nicht zu“ (safeFirst)");
await page.click("#lb-dlg-ok");
await page.waitForSelector("#lb-t-2 .lt-out:not(.hidden)");
ok((await page.textContent("#lb-t-2 .lt-out")).includes("Demokratie"), "Korrekturvorschlag angezeigt");
ok((await page.inputValue("#lb-a-2")).includes("Deomkratie"), "Feld unverändert (Prüfung schreibt nie ins Feld)");
ok(ltReqs.length === 1 && !ltReqs[0].includes("Max") && !ltReqs[0].includes("Muster"), "an LanguageTool nur der Text, ohne Namen", ltReqs);
// Tippfehler selbst korrigieren: Doppelklick markiert das Wort, dann neu tippen
const v2 = await page.inputValue("#lb-a-2"); const at = v2.indexOf("Deomkratie");
await page.evaluate((a) => { const ta = document.getElementById("lb-a-2"); ta.focus(); ta.setSelectionRange(a, a + 10); }, at);
await page.keyboard.type("Demokratie", { delay: 100 });
ok((await page.inputValue("#lb-a-2")).includes("die Demokratie in"), "selbst korrigiert");
ok(await page.isVisible("#lb-t-2 .lt-stale"), "alte Prüfung als älterer Stand markiert");

console.log("7. Zwischenstand");
const interim = await download(() => page.click("#lb-interim"));
ok(/^Zwischenstand vom \d{2}\.\d{2}\.\d{4} um \d{2}\.\d{2} von Max Muster-Mann\.pdf$/.test(interim.name), "Dateiname Zwischenstand", interim.name);
const ri = summary(await analyze(interim.name, interim.bytes));
console.log("    Check:", JSON.stringify(ri));
ok(ri.kind === "lerntagebuch" && ri.interim === true && !ri.interimMismatch && !ri.err, "Check: Lerntagebuch, Zwischenstand");
ok((await page.textContent("#lb-save-state")).startsWith("Zwischenstand gesichert"), "Status nach dem Sichern");

console.log("8. Restliche Wörter und fertige PDF");
await page.type("#lb-a-4", " Außerdem möchte ich verstehen, warum manche Menschen nicht wählen gehen und was man dagegen tun kann.", { delay: 40 });
await page.type("#lb-a-3", " Das Bundesverfassungsgericht prüft Gesetze und schützt die Grundrechte aller Menschen.", { delay: 60 });
const words2 = await page.textContent("#lb-words");
ok(words2.includes("erreicht"), "60 Wörter erreicht", words2);
ok(await page.getAttribute("#lb-final", "aria-disabled") === "false", "Knopf freigegeben");
ok((await page.evaluate(() => document.querySelector("#lb-steps-list li.cur").textContent)).startsWith("Lerntagebuch-PDF herunterladen"), "Ablauf: Schritt 2 aktuell");
const fin = await download(() => page.click("#lb-final"));
const today = new Date(); const p2 = (n) => String(n).padStart(2, "0");
ok(fin.name === `Lerntagebucheintrag_Max_Muster-Mann_${p2(today.getDate())}${p2(today.getMonth() + 1)}${today.getFullYear()}.pdf`, "Dateiname wie bisher", fin.name);
ok(await page.isVisible("#lb-done"), "Abschlussseite");
ok((await page.textContent("#lb-done-file")) === fin.name, "Dateiname auf der Abschlussseite");
const rf = await analyze(fin.name, fin.bytes); const sf = summary(rf);
console.log("    Check:", JSON.stringify(sf));
ok(sf.kind === "lerntagebuch" && sf.interim === false && !sf.err && !sf.ltbAdded && !sf.interimMismatch && !sf.redWarn, "Check: fertiger Lerntagebuch-Eintrag ohne Warnungen");
ok(sf.vn === "Max" && sf.nn === "Muster-Mann", "Check: Vor- und Nachname getrennt");
ok(sf.ltb && /29\.10\.2026$/.test(sf.ltb.date) && sf.ltb.src === "auswahl", "Check: Datum aus dem Kalenderfeld", sf.ltb);
ok(sf.ltb && sf.ltb.red > 0 && sf.ltb.red < 50, "Check: Rot-Anteil plausibel (schnell getippter Teil rot)", sf.ltb && sf.ltb.red);
const pl = await payloadOf(fin.bytes);
ok(pl.ltb === 1 && pl.kl === "8b" && pl.v === 2 && pl.z === 0 && pl.n === "Max Muster-Mann", "Nutzdaten: Kennung, Klasse, v2, z0");
ok(pl.r === C.computeStats(pl.t, pl.m).redPct, "Nutzdaten: r passt zur Formel des Checks");
ok(pl.t.startsWith(C.LTB_QUESTIONS[0] + "\nDonnerstag, 29.10.2026\n\n" + C.LTB_QUESTIONS[1] + "\nWie funktioniert die Demokratie"), "Nutzdaten: Aufbau von t", pl.t.slice(0, 160));
const kLen = pl.k.reduce((a, b) => a + b[1], 0) + pl.k.length - 1;
ok(kLen === pl.t.length && pl.k.filter((b) => b[0] === 1).length === 5 && pl.k.every((b) => b[2] === 0), "Nutzdaten: k stimmt mit t überein, 5 Aufgabenblöcke");
ok(pl.m.length === pl.t.length && pl.f.length === pl.t.length, "Nutzdaten: m und f je Zeichen");
const qStart = pl.t.indexOf(C.LTB_QUESTIONS[2]);
ok(pl.m.slice(qStart, qStart + C.LTB_QUESTIONS[2].length).every((x) => x[0] === "s" && x[1] === -1) && pl.f[qStart] === 17, "Nutzdaten: Fragen als Systemtext, fett");
const a5 = pl.t.indexOf("wer kontrolliert sie?");
ok(pl.m.slice(a5 + 1, a5 + 10).every((x) => x[0] === "t" && x[1] >= 0 && x[1] <= 15), "Nutzdaten: schnell Getipptes hat Abstände ≤ 15 ms", pl.m.slice(a5, a5 + 10));
const a2 = pl.t.indexOf("Wie funktioniert");
ok(pl.m[a2][1] === -1 && pl.m.slice(a2 + 1, a2 + 8).every((x) => x[0] === "t" && x[1] > 50), "Nutzdaten: normal Getipptes mit gemessenen Abständen", pl.m.slice(a2, a2 + 8));
const nl3 = pl.t.indexOf("besprochen.\nLegislative") + "besprochen.".length;
ok(pl.f[nl3] === 0 && pl.m[nl3][0] === "t" && pl.m[nl3][1] >= 0, "Nutzdaten: getippter Zeilenumbruch als normaler Trenner", [pl.f[nl3], pl.m[nl3]]);
ok(!pl.m.some((x) => x[0] === "p"), "Nutzdaten: nichts als eingefügt markiert");
const pdfStr = latin1(fin.bytes);
ok(pdfStr.startsWith("%PDF-1.7\n") && /\n%TRACKDATA [^\n]+\n1 0 obj/.test(pdfStr), "PDF: TRACKDATA im Kopf");
ok(pdfStr.includes("(Max Muster-Mann \xB7 Klasse 8b) Tj"), "PDF: Name und Klasse oben sichtbar");

console.log("9. Dieselbe Datei erneut, zurück zur Bearbeitung");
const again = await download(() => page.click("#lb-done-again"));
ok(Buffer.compare(Buffer.from(again.bytes), Buffer.from(fin.bytes)) === 0, "erneuter Download = byte-gleiche Datei");
await page.click("#lb-done-back");
ok(await page.isVisible("#lb-editor") && (await page.inputValue("#lb-a-5")).includes("kontrolliert"), "zurück zur Bearbeitung, Text erhalten");
const fin2 = await download(() => page.click("#lb-final"));
ok(Buffer.compare(Buffer.from(fin2.bytes), Buffer.from(fin.bytes)) === 0, "ohne Änderung wieder dieselbe Datei");
await page.click("#lb-done-back");
await page.type("#lb-a-5", " Ergänzung.", { delay: 80 });
const fin3 = await download(() => page.click("#lb-final"));
ok(Buffer.compare(Buffer.from(fin3.bytes), Buffer.from(fin.bytes)) !== 0, "nach einer Änderung eine neue Datei");

console.log("10. Warnung beim Verlassen");
await page.click("#lb-done-back");
await page.type("#lb-a-5", " Noch etwas", { delay: 50 });

const bu = () => page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
ok(await bu() === true, "beforeunload-Warnung bei ungesicherten Änderungen");
await page.click("#lb-interim"); await page.waitForTimeout(400);
ok(await bu() === false, "keine Warnung nach dem Sichern als Zwischenstand");
await page.type("#lb-a-5", "!", { delay: 50 });
ok(await bu() === true, "nach weiterer Änderung wieder Warnung");

console.log("11. Zwischenstand laden (neue Seite)");
const p2page = await ctx.newPage();
const errs2 = [];
p2page.on("pageerror", (e) => errs2.push(e.message));
await p2page.goto(URL_);
async function upload(pg, bytes, name) { await pg.setInputFiles("#lb-resume-file", { name, mimeType: "application/pdf", buffer: Buffer.from(bytes) }); await pg.waitForTimeout(400); }
await upload(p2page, interim.bytes, interim.name);
ok(await p2page.isVisible("#lb-editor"), "Zwischenstand geöffnet");
ok((await p2page.textContent("#lb-who")) === "Max Muster-Mann · Klasse 8b", "Angaben aus dem Zwischenstand");
ok((await p2page.inputValue("#lb-date")) === "2026-10-29" && (await p2page.textContent("#lb-date-out")) === "Donnerstag, 29.10.2026", "Datum wiederhergestellt");
const pi = await payloadOf(interim.bytes);
ok((await p2page.inputValue("#lb-a-3")) === "Wir haben die Gewaltenteilung besprochen.\nLegislative, Exekutive und Judikative kontrollieren sich gegenseitig.", "Antwort mit Zeilenumbruch wiederhergestellt");
ok((await p2page.textContent("#lb-ed-note")).includes("Zwischenstand ist geladen"), "Hinweis „Zwischenstand geladen“");
await p2page.type("#lb-a-3", " Das Bundesverfassungsgericht prüft Gesetze und schützt die Grundrechte aller Menschen.", { delay: 40 });
await p2page.type("#lb-a-4", " Außerdem möchte ich verstehen, warum manche Menschen nicht wählen gehen und was man dagegen tun kann.", { delay: 40 });
const fin4 = await (async () => { const [d] = await Promise.all([p2page.waitForEvent("download"), p2page.click("#lb-final")]); const p = path.join(OUT, "resumed.pdf"); await d.saveAs(p); return new Uint8Array(fs.readFileSync(p)); })();
const p4 = await payloadOf(fin4);
// Zeitwerte der wiederhergestellten Zeichen bleiben gleich
const i2 = pi.t.indexOf("Wir haben"), j2 = p4.t.indexOf("Wir haben"), L = "Wir haben die Gewaltenteilung besprochen.\nLegislative".length;
ok(JSON.stringify(pi.m.slice(i2, i2 + L)) === JSON.stringify(p4.m.slice(j2, j2 + L)), "Zeitwerte nach dem Laden unverändert");
const s4 = summary(await analyze("Lerntagebucheintrag_Max_Muster-Mann_01112026.pdf", fin4));
ok(s4.kind === "lerntagebuch" && !s4.ltbAdded && s4.ltb.src === "auswahl", "Check liest auch die Datei nach dem Weiterarbeiten", s4);
ok(errs2.length === 0, "keine Skriptfehler (Seite 2)", errs2);

console.log("12. Fremde und alte Dateien");
const p3 = await ctx.newPage(); await p3.goto(URL_);
await upload(p3, new TextEncoder().encode("Hallo"), "x.pdf");
ok((await p3.textContent("#lb-resume-err")).startsWith("Das ist keine PDF-Datei"), "keine PDF");
await upload(p3, new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"), "y.pdf");
ok((await p3.textContent("#lb-resume-err")).startsWith("In dieser PDF-Datei steckt kein Zwischenstand"), "PDF ohne Daten");
// altes Lerntagebuch-Format (ohne Kennung ltb): Nutzdaten wie bisher
const old = { ...pi }; delete old.ltb; delete old.kl;
const bundle = await E.aesEncrypt(JSON.stringify(old), E._kf("Max"));
await upload(p3, new TextEncoder().encode("%PDF-1.7\n%TRACKDATA " + bundle + "\n1 0 obj\n<<>>\nendobj\n%%EOF"), "Zwischenstand alt.pdf");
ok((await p3.textContent("#lb-resume-err")).includes("älteren Version"), "alter Zwischenstand abgelehnt", await p3.textContent("#lb-resume-err"));
const evil = { ...pi, t: pi.t.replace(C.LTB_QUESTIONS[3], "4) Andere Frage?") };
const b2 = await E.aesEncrypt(JSON.stringify(evil), E._kf("Max"));
await upload(p3, new TextEncoder().encode("%PDF-1.7\n%TRACKDATA " + b2 + "\n1 0 obj\n<<>>\nendobj\n%%EOF"), "z.pdf");
ok((await p3.textContent("#lb-resume-err")).includes("beschädigt"), "veränderte Fragen abgelehnt");
await upload(p3, new TextEncoder().encode("%PDF-1.7\n%ESCAPEDATA eyJ2IjoxfQ==\n1 0 obj\n<<>>\nendobj\n%%EOF"), "esc.pdf");
ok((await p3.textContent("#lb-resume-err")).includes("Escape-Room"), "Überblick-PDF eines Escape-Rooms erkannt");
ok(await p3.isVisible("#lb-start"), "bleibt auf der Startseite");

console.log("13. Abbrechen und neu beginnen");
await page.click("#lb-cancel");
await page.waitForSelector("#lb-dlg.open");
await page.click("#lb-dlg-cancel");
ok(await page.isVisible("#lb-editor"), "„Weiterschreiben“ bleibt im Schreibbereich");
await page.click("#lb-cancel"); await page.click("#lb-dlg-ok");
ok(await page.isVisible("#lb-start") && (await page.inputValue("#lb-vorname")) === "Max", "verworfen, Angaben bleiben im Startformular");

console.log("14. Allgemein");
ok(errs.length === 0, "keine Skriptfehler", errs);
ok(otherReqs.every((u) => u.startsWith("https://api.languagetool.org/")), "keine anderen Verbindungen nach außen", otherReqs);
ok((await page.evaluate(() => window.__csp)).length === 0, "keine CSP-Verletzung", await page.evaluate(() => window.__csp));
const st = await page.evaluate(() => { try { return [localStorage.length, sessionStorage.length, document.cookie]; } catch (e) { return String(e); } });
ok(JSON.stringify(st) === JSON.stringify([0, 0, ""]), "nichts im Browser gespeichert", st);
await browser.close();
server.close();
console.log(fails ? `\n${fails} FEHLER` : "\nalles bestanden");
process.exit(fails ? 1 : 0);
