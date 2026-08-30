// ============================================================ PAGINE-PARSE
// Antigressione: le pagine pubbliche (banditore e partecipante) contengono
// <script> inline; un errore di sintassi in uno di essi ammazza TUTTO lo
// script (nemmeno la schermata PIN) senza che i test del server se ne
// accorgano. Qui compiliamo ogni script inline con vm.Script.
// Lezione del 30/08/2026: quattro righe orfane rimaste in banditore.html
// dopo un refactor hanno tenuto la pagina morta per tre commit.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PAGINE = ["banditore.html", "index.html"];
const dirPubblica = path.join(__dirname, "public");

const SCRIPT_INLINE = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;

for (const pagina of PAGINE) {
  test(`pagina "${pagina}": ogni script inline compila senza errori di sintassi`, () => {
    const html = fs.readFileSync(path.join(dirPubblica, pagina), "utf8");
    const trovati = [...html.matchAll(SCRIPT_INLINE)];
    assert.ok(trovati.length > 0, "nessuno script inline trovato: regex rotta?");
    trovati.forEach((m, i) => {
      try {
        new vm.Script(m[1], { filename: `${pagina}#script${i + 1}` });
      } catch (err) {
        assert.fail(`${pagina} script #${i + 1} NON compila: ${err.message}`);
      }
    });
  });
}

// Antigressione QR (30/08/2026): con la selezione automatica dei dati la libreria
// vendored codifica l'URL in modalità alfanumerica e produce QR che i lettori NON
// decodificano (zbar e OpenCV: payload vuoto). Il QR va sempre creato con
// addData(url, "Byte"). Qui fermiamo almeno la regressione involontaria.
test("pagina banditore: il QR viene creato con addData in modalità Byte", () => {
  const html = fs.readFileSync(path.join(dirPubblica, "banditore.html"), "utf8");
  assert.ok(
    /addData\(\s*\w+\s*,\s*["']Byte["']\s*\)/.test(html),
    'manca qr.addData(url, "Byte") prima di qr.make(): il QR diventerebbe illeggibile'
  );
  const iAdd = html.indexOf("addData(");
  const iMake = html.indexOf(".make()");
  assert.ok(iAdd >= 0 && iMake > iAdd, "addData deve precedere make()");
});
