# Estrae il listone ufficiale fantacalcio.it 2026/27 dalla pagina Sky TG24 salvata,
# seleziona i migliori giocatori per ruolo (con margine sui reparti per 8 partecipanti,
# quote 3/8/8/6 = 200 slot) e genera lista .xlsx + .csv pronte per l'asta.
import io, re, sys, zipfile, html

SORGENTE = "listone_raw.html"
XLSX_OUT = r"V:\Progetti GLM\App Fantacalcio\AstaWeb\liste\lista-seriea-2026-27.xlsx"
CSV_OUT = r"V:\Progetti GLM\App Fantacalcio\AstaWeb\liste\lista-seriea-2026-27.csv"
TARGET = {"P": 28, "D": 72, "C": 72, "A": 56}  # quota x8 (24/64/64/48) + margine

raw = io.open(SORGENTE, encoding="utf-8", errors="replace").read()
lis = re.findall(r"<li>(.*?)</li>", raw, re.S)
giocatori = []
scartate = []
for li in lis:
    testo = html.unescape(re.sub(r"<[^>]+>", "", li))
    testo = re.sub(r"\s+", " ", testo).strip()
    m = re.match(r"^(?P<nome>[^ ]+(?: [^ ]+)*?)\s+(?P<ruolo>[PDCA])\s+(?P<mantra>[A-Za-z][A-Za-z;]*)\s+(?P<cl>\d+)\s+(?P<ma>\d+)\s+(?P<fcl>\d+)\s+(?P<fma>\d+)$", testo)
    if m:
        giocatori.append({"nome": m["nome"], "ruolo": m["ruolo"], "cl": int(m["cl"])})
    elif testo and re.search(r"\d", testo):
        scartate.append(testo)

print(f"righe <li> totali: {len(lis)}; giocatori estratti: {len(giocatori)}; scartate: {len(scartate)}")
for r in scartate[:10]:
    print("  SCARTATA:", r)

# doppioni per nome esatto (il parser della app li segnalerebbe)
nomi = [g["nome"].lower() for g in giocatori]
doppioni = sorted({n for n in nomi if nomi.count(n) > 1})
print("doppioni:", doppioni if doppioni else "nessuno")

per_ruolo = {r: sorted([g for g in giocatori if g["ruolo"] == r], key=lambda g: (-g["cl"], g["nome"])) for r in "PDCA"}
print("disponibili per ruolo:", {r: len(v) for r, v in per_ruolo.items()})
for r in "PDCA":
    print(f"  {r}: top5 =", [(g['nome'], g['cl']) for g in per_ruolo[r][:5]], "| soglia selezione:", per_ruolo[r][TARGET[r]-1]["cl"] if len(per_ruolo[r]) >= TARGET[r] else "n/d")

selezionati = []
for r in "PDCA":
    selezionati += per_ruolo[r][:TARGET[r]]
# ordine del file: reparto P→D→C→A, quotazione decrescente (l'app riordinerà col suo ordine)
selezionati.sort(key=lambda g: ("PDCA".index(g["ruolo"]), -g["cl"], g["nome"]))
print("totale selezionati:", len(selezionati))

# ---------------------------------------------------------------- scrittura xlsx
def cell_text(col, row, sst_idx):
    return f'<c r="{col}{row}" t="s"><v>{sst_idx}</v></c>'

def cell_num(col, row, value):
    return f'<c r="{col}{row}"><v>{value}</v></c>'

def build_xlsx(path, righe, header):
    texts = list(header) if header else []
    for nome, ruolo, _ in righe:
        texts += [nome, ruolo]
    sst = [f'<si><t xml:space="preserve">{t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")}</t></si>' for t in texts]
    shared = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">%s</sst>'
              % (len(sst), len(sst), "".join(sst)))
    sheet_rows, r, idx = [], 1, 0
    if header:
        sheet_rows.append("<row r=\"1\">" + cell_text("A", 1, 0) + cell_text("B", 1, 1) + cell_text("C", 1, 2) + "</row>")
        idx = 3
        r = 2
    for nome, ruolo, q in righe:
        sheet_rows.append("<row r=\"%d\">%s%s%s</row>" % (r, cell_text("A", r, idx), cell_text("B", r, idx + 1), cell_num("C", r, q)))
        idx += 2
        r += 1
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             '<sheetData>%s</sheetData></worksheet>' % "".join(sheet_rows))
    CT = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>"""
    RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""
    WB = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Listone" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""
    WBRELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("xl/workbook.xml", WB)
        z.writestr("xl/_rels/workbook.xml.rels", WBRELS)
        z.writestr("xl/sharedStrings.xml", shared)
        z.writestr("xl/worksheets/sheet1.xml", sheet)

import os
os.makedirs(os.path.dirname(XLSX_OUT), exist_ok=True)
righe = [(g["nome"], g["ruolo"], g["cl"]) for g in selezionati]
build_xlsx(XLSX_OUT, righe, ["Nome", "Ruolo", "Quotazione"])
with io.open(CSV_OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("Nome;Ruolo;Quotazione\n")
    for nome, ruolo, q in righe:
        f.write(f"{nome};{ruolo};{q}\n")
print("scritti:", XLSX_OUT)
print("scritto:", CSV_OUT)
print("prime 5 righe:", righe[:5])
print("ultime 3 righe:", righe[-3:])
