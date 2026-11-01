// Testhilfe: führt analyzeFile() von „Check des Feind(t)es“ (janrickmer/check-des-feind-t-es, index.html: vom Abschnitt
// „Konfiguration“ bis vor „Tabelle“) in Node auf PDF-Bytes aus und liest die Hintergrunddaten mit den Krypto-Funktionen der
// Engine aus index.html dieses Repositorys. Pfad zum Check: Umgebungsvariable CHECK_HTML (Vorgabe: Nachbarordner).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = process.env.CHECK_HTML || path.join(HERE, "..", "..", "check-des-feind-t-es", "index.html");
const LTB = path.join(HERE, "..", "index.html");
if (!fs.existsSync(CHECK)) throw new Error("Check des Feind(t)es nicht gefunden: " + CHECK + " – CHECK_HTML setzen");
const checkSrc = fs.readFileSync(CHECK, "utf8");
const cFrom = checkSrc.indexOf("/* ---------------- Konfiguration"), cTo = checkSrc.indexOf("/* ---------------- Tabelle");
if (cFrom < 0 || cTo < cFrom) throw new Error("Abschnitte im Check nicht gefunden");
const checkPart = checkSrc.slice(cFrom, cTo);
class FakeFileReader { readAsArrayBuffer(f) { setTimeout(() => { this.result = f._buf.buffer.slice(f._buf.byteOffset, f._buf.byteOffset + f._buf.byteLength); this.onload(); }, 0); } }
const ctx = { console, TextEncoder, TextDecoder, crypto: globalThis.crypto, atob, btoa, escape, unescape, FileReader: FakeFileReader, setTimeout, document: {}, localStorage: { getItem() { return null; }, setItem() {} } };
vm.createContext(ctx);
vm.runInContext(checkPart + "\nglobalThis.__C={analyzeFile,computeStats,LTB_QUESTIONS};", ctx);
export const C = ctx.__C;
const ltbLines = fs.readFileSync(LTB, "utf8").split("\n");
const pick = (re) => { const l = ltbLines.filter((x) => re.test(x)); if (l.length !== 1) throw new Error("engine line " + re + " x" + l.length); return l[0]; };
const engCode = [/^function bytesToB64\(/, /^function b64ToBytes\(/, /^async function _key\(/, /^async function aesEncrypt\(/, /^async function aesDecrypt\(/, /^function _kfN\(/, /^function _kf\(/].map(pick).join("\n");
const eng = vm.createContext({ TextEncoder, TextDecoder, crypto: globalThis.crypto, btoa, atob });
vm.runInContext(engCode + `
async function autoDec(b){ for(let n=0;n<=60;n++){ try{ return JSON.parse(await aesDecrypt(b,_kfN(n))); }catch(e){} } throw new Error("nicht entschlüsselbar"); }
globalThis.__E={aesEncrypt,_kf,autoDec};`, eng);
export const E = eng.__E;
export async function analyze(name, u8) { return C.analyzeFile({ name, _buf: u8 }); }
export function latin1(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; }
export async function payloadOf(u8) {
  const s = latin1(u8); const end = s.search(/\n\d+ 0 obj\b/);
  const m = s.slice(0, end + 1).match(/(?:^|\n)%TRACKDATA ([A-Za-z0-9+\/=]+:[A-Za-z0-9+\/=]+)(?=\r?\n)/);
  if (!m) throw new Error("kein TRACKDATA im Kopf");
  return E.autoDec(m[1]);
}
export function summary(r) {
  return { file: r.file, err: r.error || undefined, vn: r.vn, nn: r.nn, kind: r.info && r.info.kind, red: r.red,
    ltb: r.ltb ? { red: r.ltb.red, total: r.ltb.total, date: r.ltb.date && r.ltb.date.label, src: r.ltb.src, warn: r.ltb.warn || undefined } : undefined,
    interim: r.info && r.info.interim, interimMismatch: (r.info && r.info.interimMismatch) || undefined, ltbAdded: r.info && r.info.ltbAdded ? "yes" : undefined,
    redWarn: r.info && r.info.redWarn ? "yes" : undefined, redZero: r.info && r.info.redZero ? "yes" : undefined,
    grade: r.grade && r.grade.state, tasks: (r.tasks || []).map((b) => b.nr + ":" + (b.missing ? "MISSING" : b.chars) + (b.added ? "+" : "")).join(" ") };
}
