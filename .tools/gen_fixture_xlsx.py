# Genera fixture .xlsx MINIMALI e STANDARD (zip + OOXML), implementazione indipendente
# dal parser Kotlin, per collaudo incrociato. Uso: python gen_fixture_xlsx.py <out_dir>
import zipfile, sys, os

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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

WORKBOOK = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Lista" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""

WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>"""

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

def cell_text(col, row, sst_idx):
    return f'<c r="{col}{row}" t="s"><v>{sst_idx}</v></c>'

def cell_num(col, row, value):
    return f'<c r="{col}{row}"><v>{value}</v></c>'

def build_xlsx(path, rows, header):
    # rows: list of (nome, ruolo, quotazione)
    texts = []
    if header:
        texts += ["Nome", "Ruolo", "Quotazione"]
    for nome, ruolo, _ in rows:
        texts += [nome, ruolo]
    sst = ["<si><t xml:space=\"preserve\">%s</t></si>" % esc(t) for t in texts]
    shared = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">%s</sst>'
              % (len(sst), len(sst), "".join(sst)))
    sheet_rows = []
    r = 1
    idx = 0
    if header:
        sheet_rows.append("<row r=\"1\">" + cell_text("A", 1, 0) + cell_text("B", 1, 1) + cell_text("C", 1, 2) + "</row>")
        idx = 3
        r = 2
    for nome, ruolo, q in rows:
        sheet_rows.append("<row r=\"%d\">%s%s%s</row>" % (
            r, cell_text("A", r, idx), cell_text("B", r, idx + 1), cell_num("C", r, q)))
        idx += 2
        r += 1
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             '<sheetData>%s</sheetData></worksheet>' % "".join(sheet_rows))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("xl/workbook.xml", WORKBOOK)
        z.writestr("xl/_rels/workbook.xml.rels", WORKBOOK_RELS)
        z.writestr("xl/sharedStrings.xml", shared)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    print("scritto", path)

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    build_xlsx(os.path.join(out, "lista_test.xlsx"),
               [("Lautaro Martinez", "A", 45), ("Meret", "POR", 18),
                ("Giovanni Di Lorenzo", "Difensore", 22), ("Barella", "C", 28)],
               header=True)
    build_xlsx(os.path.join(out, "lista_senza_header.xlsx"),
               [("Sommer", "P", 20), ("Mkhitaryan", "C", 15)],
               header=False)
