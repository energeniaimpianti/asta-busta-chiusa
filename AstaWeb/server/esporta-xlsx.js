/**
 * Genera un file Excel (.xlsx) MULTI-FOGLIO ben formattato con TUTTI i dati dell'asta.
 * Zero dipendenze: costruisce l'OOXML a mano (zip + XML).
 *
 * Fogli:
 *   1. Squadre      — rosa completa per partecipante (colore ruolo, pagato, quotazione, plusvalenza)
 *   2. Riepilogo    — spese, residui, statistiche per partecipante
 *   3. Asta         — log completo: ogni giocatore, ogni offerta, vincitore
 *   4. Analisi      — valore strategico: overpay/underpay, best pick, budget per reparto
 *   5. Svincolati   — giocatori non venduti
 */
"use strict";

const zlib = require("zlib");

// ============================================================ COSTANTI STILI

const COLORI = {
  P: "F9A825", D: "1565C0", C: "2E7D32", A: "C62828",
  header: "1B5E20", alt: "F0F4F0", titolo: "0D3B0D",
  winner: "E8F5E9", positivo: "1B5E20", negativo: "C62828",
  bordo: "D0D0D0", grigio: "888888",
};

// ============================================================ COSTRUTTORE XLSX

class FoglioXlsx {
  constructor() {
    this.fogli = [];  // [{nome, righe: [[{v, s}]], colonne: [larghezze]}]
  }

  aggiungiFoglio(nome, righe, larghezzeColonne) {
    this.fogli.push({ nome, righe, larghezze: larghezzeColonne });
  }

  genera() {
    const zip = new ZipWriter();
    const n = this.fogli.length;

    // [Content_Types].xml
    let ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${this.fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`;
    zip.add("[Content_Types].xml", ct);

    // _rels/.rels
    zip.add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

    // xl/workbook.xml
    zip.add("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${this.fogli.map((f, i) => `<sheet name="${escap(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("\n")}
</sheets>
</workbook>`);

    // xl/_rels/workbook.xml.rels
    zip.add("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${this.fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

    // xl/styles.xml (stili predefiniti)
    zip.add("xl/styles.xml", generaStyles());

    // xl/worksheets/sheetN.xml
    this.fogli.forEach((f, idx) => {
      zip.add(`xl/worksheets/sheet${idx + 1}.xml`, generaFoglio(f));
    });

    return zip.build();
  }
}

// ============================================================ HELPER

function escap(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colLettera(idx) {
  let s = "";
  idx++;
  while (idx > 0) { const m = (idx - 1) % 26; s = String.fromCharCode(65 + m) + s; idx = Math.floor((idx - 1) / 26); }
  return s;
}

function generaFoglio(f) {
  const righeXml = f.righe.map((riga, ri) => {
    const celleXml = riga.map((cella, ci) => {
      const rif = `${colLettera(ci)}${ri + 1}`;
      const stile = cella.s !== undefined ? ` s="${cella.s}"` : "";
      if (cella.v === null || cella.v === undefined || cella.v === "") return `<c r="${rif}"${stile}/>`;
      if (typeof cella.v === "number") return `<c r="${rif}"${stile}><v>${cella.v}</v></c>`;
      return `<c r="${rif}" t="inlineStr"${stile}><is><t xml:space="preserve">${escap(cella.v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${celleXml}</row>`;
  }).join("");

  const colonneXml = f.larghezze ? f.larghezze.map((w, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
  ).join("") : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${colonneXml}</cols>
<sheetData>${righeXml}</sheetData>
</worksheet>`;
}

// ============================================================ STILI (18 stili)

function generaStyles() {
  const font0 = `<font><sz val="10"/><name val="Calibri"/></font>`;
  const fontBold = `<font><b/><sz val="10"/><name val="Calibri"/></font>`;
  const fontWhite = `<font><b/><sz val="10"/><color rgb="FFFFFF"/><name val="Calibri"/></font>`;
  const fontTitle = `<font><b/><sz val="16"/><color rgb="006600"/><name val="Calibri"/></font>`;
  const fontBold10 = `<font><b/><sz val="10"/><name val="Calibri"/></font>`;
  const fontGreen = `<font><sz val="10"/><color rgb="006600"/><name val="Calibri"/></font>`;
  const fontRed = `<font><sz val="10"/><color rgb="CC0000"/><name val="Calibri"/></font>`;
  const fontBoldGreen = `<font><b/><sz val="10"/><color rgb="006600"/><name val="Calibri"/></font>`;
  const fontBoldRed = `<font><b/><sz val="10"/><color rgb="CC0000"/><name val="Calibri"/></font>`;

  const bordo = `<border><left style="thin"><color rgb="D0D0D0"/></left><right style="thin"><color rgb="D0D0D0"/></right><top style="thin"><color rgb="D0D0D0"/></top><bottom style="thin"><color rgb="D0D0D0"/></bottom></border>`;
  const nessuno = `<border><left/><right/><top/><bottom/></border>`;
  const bordoBottom = `<border><bottom style="medium"><color rgb="1B5E20"/></bottom></border>`;

  const fillAlt = `<fill><patternFill patternType="solid"><fgColor rgb="F0F4F0"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillHeader = `<fill><patternFill patternType="solid"><fgColor rgb="1B5E20"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillP = `<fill><patternFill patternType="solid"><fgColor rgb="FFF9C4"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillD = `<fill><patternFill patternType="solid"><fgColor rgb="BBDEFB"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillC = `<fill><patternFill patternType="solid"><fgColor rgb="C8E6C9"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillA = `<fill><patternFill patternType="solid"><fgColor rgb="FFCDD2"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillWinner = `<fill><patternFill patternType="solid"><fgColor rgb="E8F5E9"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillTitle = `<fill><patternFill patternType="solid"><fgColor rgb="DCEDC8"/><bgColor indexed="64"/></patternFill></fill>`;

  const alignLeft = `<alignment horizontal="left" vertical="center"/>`;
  const alignCenter = `<alignment horizontal="center" vertical="center"/>`;
  const alignRight = `<alignment horizontal="right" vertical="center"/>`;

  const stili = [
    // 0: normale
    { font: 0, fill: null, border: nessuno, align: alignLeft },
    // 1: header (bold bianco su verde)
    { font: 2, fill: 1, border: bordo, align: alignCenter },
    // 2: dati alternati (grigio chiaro)
    { font: 0, fill: 0, border: bordo, align: alignLeft },
    // 3: numero destra
    { font: 0, fill: null, border: bordo, align: alignRight },
    // 4: numero alternato destra
    { font: 0, fill: 0, border: bordo, align: alignRight },
    // 5: ruolo P
    { font: 0, fill: 2, border: bordo, align: alignLeft },
    // 6: ruolo D
    { font: 0, fill: 3, border: bordo, align: alignLeft },
    // 7: ruolo C
    { font: 0, fill: 4, border: bordo, align: alignLeft },
    // 8: ruolo A
    { font: 0, fill: 5, border: bordo, align: alignLeft },
    // 9: titolo
    { font: 3, fill: null, border: nessuno, align: alignLeft },
    // 10: bold
    { font: 1, fill: null, border: bordo, align: alignLeft },
    // 11: vincitore (verde chiaro bold)
    { font: 7, fill: 6, border: bordo, align: alignLeft },
    // 12: positivo (verde)
    { font: 5, fill: null, border: bordo, align: alignRight },
    // 13: negativo (rosso)
    { font: 6, fill: null, border: bordo, align: alignRight },
    // 14: sezione (bold con bordo bottom)
    { font: 1, fill: null, border: bordoBottom, align: alignLeft },
    // 15: header con align left
    { font: 2, fill: 1, border: bordo, align: alignLeft },
    // 16: sottotitolo (grigio corsivo)
    { font: 8, fill: null, border: nessuno, align: alignLeft },
    // 17: dati centrati
    { font: 0, fill: null, border: bordo, align: alignCenter },
  ];

  const fontsXml = [font0, fontBold, fontWhite, fontTitle, fontBold10, fontGreen, fontRed, fontBoldGreen, fontBoldRed].map((f, i) => `<font>${f.replace(/<\/?font>/g, "")}</font>`).join("");

  const fillsXml = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    fillAlt, fillHeader, fillP, fillD, fillC, fillA, fillWinner, fillTitle
  ].join("");

  const bordersXml = [nessuno, bordo, bordoBottom].join("");

  const cellXfs = stili.map(s => {
    const fontId = s.font;
    const fillId = s.fill === null ? 0 : s.fill + 2;
    const borderId = s.border === nessuno ? 0 : s.border === bordoBottom ? 2 : 1;
    return `<xf fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${s.align}</xf>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="9">${fontsXml}</fonts>
<fills count="10">${fillsXml}</fills>
<borders count="3">${bordersXml}</borders>
<cellStyleXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${stili.length}">${cellXfs}</cellXfs>
</styleSheet>`;
}

// ============================================================ ZIP MINIMO

// CRC32 (IEEE 802.3) con tabella precalcolata
const CRC_TAB = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TAB[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class ZipWriter {
  constructor() { this.files = []; }
  add(name, content) {
    // i nomi entry usano SEMPRE lo slash: è lo standard zip/OOXML
    this.files.push({ name: String(name).replace(/\\/g, "/"), data: Buffer.from(content, "utf8") });
  }
  build() {
    // zip scritto a mano in puro Node (zlib deflateRaw): niente PowerShell —
    // Compress-Archive metteva i backslash nei nomi (zip non conforme, Excel
    // può rifiutarlo) e su Linux/CI non esiste proprio
    const parti = [];
    const centrale = [];
    let off = 0;
    for (const f of this.files) {
      const nome = Buffer.from(f.name, "utf8");
      const dati = zlib.deflateRawSync(f.data, { level: 9 });
      const crc = crc32(f.data);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);            // versione minima per estrarre
      lh.writeUInt16LE(0, 6);             // flag
      lh.writeUInt16LE(8, 8);             // metodo: deflate
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(dati.length, 18);  // dimensione compressa
      lh.writeUInt32LE(f.data.length, 22);// dimensione originale
      lh.writeUInt16LE(nome.length, 26);
      lh.writeUInt16LE(0, 28);            // lunghezza extra
      parti.push(lh, nome, dati);
      const ce = Buffer.alloc(46);
      ce.writeUInt32LE(0x02014b50, 0);
      ce.writeUInt16LE(20, 4); ce.writeUInt16LE(20, 6);
      ce.writeUInt16LE(0, 8); ce.writeUInt16LE(8, 10);
      ce.writeUInt32LE(crc, 16);
      ce.writeUInt32LE(dati.length, 20);
      ce.writeUInt32LE(f.data.length, 24);
      ce.writeUInt16LE(nome.length, 28);
      ce.writeUInt32LE(off, 42);          // offset del local header
      centrale.push(Buffer.concat([ce, nome]));
      off += 30 + nome.length + dati.length;
    }
    const cd = Buffer.concat(centrale);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(this.files.length, 8);
    eocd.writeUInt16LE(this.files.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(off, 16);
    return Buffer.concat([...parti, cd, eocd]);
  }
}

// ============================================================ GENERAZIONE DATI

function generaXlsx(stato) {
  const x = new FoglioXlsx();
  const cfg = stato.config;
  const nomeDi = (id) => stato.partecipanti.find((p) => p.id === id)?.nome || "#" + id;
  const ordineRuoli = cfg.ordineRuoli || ["P", "D", "C", "A"];
  const dataOggi = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ------------------------------------------------ S1: SQUADRE
  {
    const righe = [];
    righe.push([{ v: `ASTA BUSTA CHIUSA — ${cfg.nomeLega}`, s: 9 }]);
    righe.push([{ v: `Data: ${dataOggi} — Budget iniziale: ${cfg.budgetIniziale} FMM — Rosa: ${cfg.totaleSlot || 25} giocatori`, s: 16 }]);
    righe.push([]);

    for (const part of stato.partecipanti) {
      const sq = stato.squadre[part.id];
      const speso = sq.rosa.reduce((a, x2) => a + x2.importo, 0);
      righe.push([{ v: `${part.nome}`, s: 14 }, { v: `Speso: ${speso} FMM`, s: 10 }, { v: `Residuo: ${sq.budgetResiduo} FMM`, s: 10 }, { v: `Rosa: ${sq.rosa.length}/${cfg.totaleSlot || 25}`, s: 10 }]);
      righe.push([
        { v: "Ruolo", s: 1 }, { v: "Giocatore", s: 15 }, { v: "Pagato", s: 1 },
        { v: "Quot. base", s: 1 }, { v: "Diff.", s: 1 }, { v: "Rapporto", s: 1 }
      ]);
      let alt = false;
      for (const ruolo of ordineRuoli) {
        const giocRuolo = sq.rosa.filter(a => stato.listaById[a.idGiocatore]?.ruolo === ruolo);
        for (const a of giocRuolo) {
          const g = stato.listaById[a.idGiocatore];
          const diff = (g?.quotazioneBase || 0) - a.importo;
          const rapporto = g?.quotazioneBase ? (a.importo / g.quotazioneBase).toFixed(2) : "—";
          const sRuolo = { P: 5, D: 6, C: 7, A: 8 }[ruolo] || 0;
          const base = alt ? 2 : 0;
          righe.push([
            { v: ruolo, s: sRuolo }, { v: g?.nome || "?", s: base },
            { v: a.importo, s: alt ? 4 : 3 },
            { v: g?.quotazioneBase || 0, s: alt ? 4 : 3 },
            { v: diff, s: diff >= 0 ? (alt ? 4 : 3) : (alt ? 4 : 3) },
            { v: rapporto, s: alt ? 4 : 3 },
          ]);
          alt = !alt;
        }
      }
      righe.push([]);
    }
    x.aggiungiFoglio("Squadre", righe, [8, 28, 10, 12, 10, 10]);
  }

  // ------------------------------------------------ S2: RIEPILOGO
  {
    const righe = [];
    righe.push([{ v: "RIEPILOGO ASTA", s: 9 }]);
    righe.push([]);
    righe.push([
      { v: "Partecipante", s: 1 }, { v: "Speso", s: 1 }, { v: "Residuo", s: 1 },
      { v: "Rosa", s: 1 }, { v: "Prezzo medio", s: 1 }, { v: "Slot vuoti", s: 1 }
    ]);
    let alt = false;
    for (const part of stato.partecipanti) {
      const sq = stato.squadre[part.id];
      const speso = sq.rosa.reduce((a, x2) => a + x2.importo, 0);
      const medio = sq.rosa.length ? Math.round(speso / sq.rosa.length) : 0;
      righe.push([
        { v: part.nome, s: alt ? 2 : 0 },
        { v: speso, s: alt ? 4 : 3 }, { v: sq.budgetResiduo, s: alt ? 4 : 3 },
        { v: sq.rosa.length, s: alt ? 17 : 17 }, { v: medio, s: alt ? 4 : 3 },
        { v: (cfg.totaleSlot || 25) - sq.rosa.length, s: alt ? 17 : 17 },
      ]);
      alt = !alt;
    }
    righe.push([]);
    const totaleSpeso = stato.partecipanti.reduce((a, p) => a + stato.squadre[p.id].rosa.reduce((x, y) => x + y.importo, 0), 0);
    righe.push([{ v: "TOTALE", s: 10 }, { v: totaleSpeso, s: 10 }, { v: "", s: 0 }, { v: "", s: 0 }, { v: "", s: 0 }, { v: "", s: 0 }]);
    x.aggiungiFoglio("Riepilogo", righe, [20, 12, 12, 10, 14, 12]);
  }

  // ------------------------------------------------ S3: ASTA COMPLETA
  {
    const righe = [];
    righe.push([{ v: "ASTA COMPLETA — ogni giocatore, ogni offerta", s: 9 }]);
    righe.push([]);
    righe.push([
      { v: "Round", s: 1 }, { v: "Giocatore", s: 15 }, { v: "Ruolo", s: 1 },
      { v: "Quot. base", s: 1 }, { v: "Vincitore", s: 15 }, { v: "Pagato", s: 1 },
      { v: "Offerte (dal più basso)", s: 15 }, { v: "Passi", s: 15 }, { v: "Note", s: 15 }
    ]);

    // ricostruisci da eventi
    const aggiudicazioni = new Map();
    const nonVendutiSet = new Set(stato.nonVenduti);
    for (const ev of stato.eventi) {
      if (ev.tipo === "Aggiudicazione" || ev.tipo === "Sorteggio") aggiudicazioni.set(ev.idGiocatore, ev);
    }

    const offertePerRound = new Map();
    for (const ev of stato.eventi) {
      if (ev.tipo === "OffertaRegistrata") {
        if (!offertePerRound.has(ev.roundId)) offertePerRound.set(ev.roundId, []);
        offertePerRound.get(ev.roundId).push(ev);
      }
    }

    let roundCorrente = 0;
    let alt = false;
    for (const g of stato.lista) {
      roundCorrente++;
      const agg = aggiudicazioni.get(g.id);
      const offerte = offertePerRound.get(roundCorrente) || [];
      const valide = offerte.filter(o => o.importo > 0).sort((a, b) => a.importo - b.importo);
      const passi = offerte.filter(o => o.importo === 0);
      const nomeVincitore = agg ? nomeDi(agg.idPartecipante) : "";
      const pagato = agg ? agg.importo : "";

      const offerteTxt = valide.map(o => `${nomeDi(o.idPartecipante)}: ${o.importo}`).join(", ");
      const passiTxt = passi.map(o => nomeDi(o.idPartecipante)).join(", ");

      let nota = "";
      if (!agg && nonVendutiSet.has(g.id)) nota = "SVINCOLATO";
      if (agg && stato.eventi.some(e => e.tipo === "Sorteggio" && e.idGiocatore === g.id)) nota = "SORTEGGIO";

      const isWinner = !!agg;
      righe.push([
        { v: roundCorrente, s: alt ? 17 : 17 },
        { v: g.nome, s: isWinner ? 11 : (alt ? 2 : 0) },
        { v: g.ruolo, s: { P: 5, D: 6, C: 7, A: 8 }[g.ruolo] || 0 },
        { v: g.quotazioneBase, s: alt ? 4 : 3 },
        { v: nomeVincitore, s: isWinner ? 11 : (alt ? 2 : 0) },
        { v: pagato, s: isWinner ? (alt ? 4 : 3) : (alt ? 17 : 17) },
        { v: offerteTxt, s: alt ? 2 : 0 },
        { v: passiTxt, s: alt ? 2 : 0 },
        { v: nota, s: alt ? 2 : 0 },
      ]);
      alt = !alt;
    }
    x.aggiungiFoglio("Asta completa", righe, [8, 22, 7, 10, 16, 10, 40, 25, 12]);
  }

  // ------------------------------------------------ S4: ANALISI
  {
    const righe = [];
    righe.push([{ v: "ANALISI STRATEGICA", s: 9 }]);
    righe.push([{ v: "Quanto hai pagato rispetto alla quotazione ufficiale? Rapporto < 1 = affare, > 1 = overpay", s: 16 }]);
    righe.push([]);
    righe.push([
      { v: "Giocatore", s: 15 }, { v: "Ruolo", s: 1 }, { v: "Vincitore", s: 15 },
      { v: "Quot. base", s: 1 }, { v: "Pagato", s: 1 }, { v: "Rapporto", s: 1 }, { v: "Verdetto", s: 1 }
    ]);

    const acquisti = [];
    for (const part of stato.partecipanti) {
      for (const a of stato.squadre[part.id].rosa) {
        const g = stato.listaById[a.idGiocatore];
        if (g) acquisti.push({ g, part, importo: a.importo });
      }
    }
    acquisti.sort((a, b) => (a.importo / Math.max(1, a.g.quotazioneBase)) - (b.importo / Math.max(1, b.g.quotazioneBase)));

    let alt = false;
    for (const { g, part, importo } of acquisti) {
      const rap = g.quotazioneBase ? (importo / g.quotazioneBase) : 0;
      const verdetto = rap < 0.5 ? "GRANDE AFFARE" : rap < 0.8 ? "Affare" : rap < 1.2 ? "Giusto" : rap < 1.5 ? "Overpay" : "GRAN OVERPAY";
      righe.push([
        { v: g.nome, s: alt ? 2 : 0 },
        { v: g.ruolo, s: { P: 5, D: 6, C: 7, A: 8 }[g.ruolo] || 0 },
        { v: part.nome, s: alt ? 2 : 0 },
        { v: g.quotazioneBase, s: alt ? 4 : 3 },
        { v: importo, s: alt ? 4 : 3 },
        { v: rap.toFixed(2), s: rap <= 1 ? 12 : 13 },
        { v: verdetto, s: rap < 0.5 ? 12 : rap > 1.5 ? 13 : (alt ? 2 : 0) },
      ]);
      alt = !alt;
    }
    x.aggiungiFoglio("Analisi", righe, [22, 7, 16, 12, 10, 10, 16]);
  }

  // ------------------------------------------------ S5: SVINCOLATI
  {
    const righe = [];
    righe.push([{ v: "GIOCATORI SVINCOLATI (nessuno li ha comprati)", s: 9 }]);
    righe.push([]);
    if (stato.nonVenduti.length === 0) {
      righe.push([{ v: "Nessun giocatore svincolato: tutti venduti!", s: 0 }]);
    } else {
      righe.push([{ v: "Giocatore", s: 1 }, { v: "Ruolo", s: 1 }, { v: "Quot. base", s: 1 }]);
      let alt = false;
      for (const id of stato.nonVenduti) {
        const g = stato.listaById[id];
        if (!g) continue;
        righe.push([
          { v: g.nome, s: alt ? 2 : 0 },
          { v: g.ruolo, s: { P: 5, D: 6, C: 7, A: 8 }[g.ruolo] || 0 },
          { v: g.quotazioneBase, s: alt ? 4 : 3 },
        ]);
        alt = !alt;
      }
    }
    x.aggiungiFoglio("Svincolati", righe, [25, 10, 12]);
  }

  return x.genera();
}

module.exports = { generaXlsx };
