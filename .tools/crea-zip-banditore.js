/**
 * Rigenera lo zip del banditore (AstaBustaChiusa.zip) dalla cartella sorgente
 * .tools/zip-banditore/AstaBustaChiusa. Zip scritto a mano in Node puro con
 * separatori "/" (PowerShell Compress-Archive scrive backslash nei nomi:
 * zip non conformi, estrazione fallita su Linux/Mac — LEZIONE del 30/08/2026).
 * Uso:  node .tools/crea-zip-banditore.js
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SRC = path.join(__dirname, "zip-banditore", "AstaBustaChiusa");
const OUT = path.join(__dirname, "zip-banditore", "AstaBustaChiusa.zip");

// CRC32 (IEEE 802.3) con tabella precalcolata
const CRCTAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRCTAB[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function* listaFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* listaFiles(p);
    else yield p;
  }
}

const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (9 << 5) | 7; // 07/09/2026
const voci = [];
let offset = 0;
const out = [];

for (const f of listaFiles(SRC)) {
  const nome = path.relative(SRC, f).split(path.sep).join("/");
  const dati = fs.readFileSync(f);
  const defl = zlib.deflateRawSync(dati, { level: 9 });
  const usaDefl = defl.length < dati.length;
  const corpo = usaDefl ? defl : dati;
  const crc = crc32(dati);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);          // versione necessaria
  lh.writeUInt16LE(0, 6);           // flag
  lh.writeUInt16LE(usaDefl ? 8 : 0, 8);
  lh.writeUInt16LE(DOS_TIME, 10);
  lh.writeUInt16LE(DOS_DATE, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(corpo.length, 18);
  lh.writeUInt32LE(dati.length, 22);
  lh.writeUInt16LE(nome.length, 26);
  out.push(lh, Buffer.from(nome, "utf8"), corpo);

  voci.push({ nome, crc, cSize: corpo.length, size: dati.length, offset, metodo: usaDefl ? 8 : 0 });
  offset += 30 + nome.length + corpo.length;
}

const cdir = [];
for (const v of voci) {
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);          // versione necessaria
  ch.writeUInt16LE(0, 8);
  ch.writeUInt16LE(v.metodo, 10);
  ch.writeUInt16LE(DOS_TIME, 12);
  ch.writeUInt16LE(DOS_DATE, 14);
  ch.writeUInt32LE(v.crc, 16);
  ch.writeUInt32LE(v.cSize, 20);
  ch.writeUInt32LE(v.size, 24);
  ch.writeUInt16LE(v.nome.length, 28);
  // campi 30..41 a zero: disco, attributi interni/esterni
  ch.writeUInt32LE(v.offset, 42);
  cdir.push(ch, Buffer.from(v.nome, "utf8"));
}
const cdirBuf = Buffer.concat(cdir);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(voci.length, 8);
eocd.writeUInt16LE(voci.length, 10);
eocd.writeUInt32LE(cdirBuf.length, 12);
eocd.writeUInt32LE(offset, 16);

fs.writeFileSync(OUT, Buffer.concat([...out, cdirBuf, eocd]));
console.log(`${voci.length} file -> ${OUT} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
