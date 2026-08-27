package com.fantacalcio.astachiusa.core

import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

/**
 * Lettore .xlsx minimale e autonomo (nessuna dipendenza): primo foglio → griglia di stringhe.
 * Gestisce sharedStrings, celle inline, valori numerici/testuali e righe sparse.
 * Solo Kotlin/JVM puro: verificato su JVM host.
 */
object ParserXlsx {

    fun leggiGriglia(bytes: ByteArray): List<List<String>> {
        val voci = LinkedHashMap<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            var e = zip.nextEntry
            while (e != null) {
                if (!e.isDirectory) voci[e.name] = zip.readBytes()
                e = zip.nextEntry
            }
        }
        val shared = voci["xl/sharedStrings.xml"]?.let(::leggiSharedStrings) ?: emptyList()

        // Primo foglio dichiarato nel workbook, risolto tramite le relazioni (ordine reale).
        val foglio = nomePrimoFoglio(voci) ?: "xl/worksheets/sheet1.xml"
        val xmlFoglio = voci[foglio] ?: error("Foglio non trovato nel file .xlsx ($foglio)")
        return leggiFoglio(xmlFoglio, shared)
    }

    /** sharedStrings.xml: textContent di <si> copre sia <t> sia i rich-run <r><t>..</t></r>. */
    private fun leggiSharedStrings(xml: ByteArray): List<String> {
        val si = documento(xml).getElementsByTagName("si")
        val out = ArrayList<String>(si.length)
        for (i in 0 until si.length) out.add(si.item(i).textContent)
        return out
    }

    private fun nomePrimoFoglio(voci: Map<String, ByteArray>): String? {
        val workbook = voci["xl/workbook.xml"] ?: return null
        val rels = voci["xl/_rels/workbook.xml.rels"] ?: return null
        val wDoc = documento(workbook)
        val sheets = wDoc.getElementsByTagName("sheet")
        if (sheets.length == 0) return null
        val prima = sheets.item(0) as Element
        val rid = prima.getAttribute("r:id").ifEmpty { prima.getAttribute("id") }
        if (rid.isEmpty()) return null
        val rDoc = documento(rels)
        val relList = rDoc.getElementsByTagName("Relationship")
        for (i in 0 until relList.length) {
            val el = relList.item(i) as Element
            if (el.getAttribute("Id") == rid) {
                val target = el.getAttribute("Target")
                return if (target.startsWith("/")) target.drop(1)
                else "xl/$target"
            }
        }
        return null
    }

    private fun leggiFoglio(xml: ByteArray, shared: List<String>): List<List<String>> {
        val doc = documento(xml)
        val righe = doc.getElementsByTagName("row")
        val out = ArrayList<List<String>>(righe.length)
        for (i in 0 until righe.length) {
            val rowEl = righe.item(i) as Element
            val celle = rowEl.getElementsByTagName("c")
            var maxCol = -1
            val valori = LinkedHashMap<Int, String>()
            for (j in 0 until celle.length) {
                val c = celle.item(j) as Element
                val rif = c.getAttribute("r") // es. "B3"
                val colIdx = indiceColonna(rif)
                maxCol = maxOf(maxCol, colIdx)
                val tipo = c.getAttribute("t")
                val valore = when (tipo) {
                    "s" -> {
                        val v = testoFiglio(c, "v")?.toIntOrNull()
                        if (v != null && v in shared.indices) shared[v] else ""
                    }
                    "inlineStr" -> testoFiglio(c, "is")?.trim() ?: ""
                    else -> testoFiglio(c, "v") ?: ""
                }
                valori[colIdx] = valore.trim()
            }
            // Densifica la riga fino all'ultima colonna presente.
            if (maxCol >= 0) out.add((0..maxCol).map { valori[it] ?: "" })
        }
        return out
    }

    private fun testoFiglio(c: Element, tag: String): String? {
        val figli = c.getElementsByTagName(tag)
        return if (figli.length > 0) figli.item(0).textContent else null
    }

    private fun indiceColonna(rif: String): Int {
        var idx = 0
        for (ch in rif) {
            if (ch.isLetter()) idx = idx * 26 + (ch.uppercaseChar() - 'A' + 1) else break
        }
        return idx - 1
    }

    private fun documento(xml: ByteArray) =
        DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        }.newDocumentBuilder().parse(ByteArrayInputStream(xml))
}
