package com.fantacalcio.astachiusa.core

/**
 * Parsing della lista giocatori da griglia (xlsx/csv): riconoscimento header,
 * normalizzazione ruoli e quotazioni, raccolta errori per riga.
 */
object ParserLista {

    data class EsitoLista(
        val giocatori: List<GiocatoreLista>,
        val errori: List<String>,
        val righeLette: Int,
        val avvisi: List<String> = emptyList()
    )

    data class Colonne(val nome: Int, val ruolo: Int, val quotazione: Int?)

    fun daCsv(testo: String): EsitoLista = daGriglia(grigliaDaCsv(testo))

    fun daXlsx(bytes: ByteArray): EsitoLista = daGriglia(ParserXlsx.leggiGriglia(bytes))

    // ------------------------------------------------------------------ CSV

    /** CSV con delimitatore auto-rilevato (; , tab), virgolette e BOM gestiti. */
    fun grigliaDaCsv(testo: String): List<List<String>> {
        val pulito = testo.removePrefix("\uFEFF")
        val righe = pulito.split(Regex("\\r?\\n")).filter { it.isNotBlank() }
        if (righe.isEmpty()) return emptyList()
        val delim = listOf(';', ',', '\t')
            .maxByOrNull { d -> righe.first().count { it == d } } ?: ';'
        return righe.map { splittaRigaCsv(it, delim) }
    }

    private fun splittaRigaCsv(riga: String, delim: Char): List<String> {
        val out = ArrayList<String>()
        val sb = StringBuilder()
        var inVirgolette = false
        var i = 0
        while (i < riga.length) {
            val c = riga[i]
            when {
                inVirgolette -> if (c == '"') {
                    if (i + 1 < riga.length && riga[i + 1] == '"') {
                        sb.append('"'); i++
                    } else inVirgolette = false
                } else sb.append(c)
                c == '"' -> inVirgolette = true
                c == delim -> { out.add(sb.toString().trim()); sb.clear() }
                else -> sb.append(c)
            }
            i++
        }
        out.add(sb.toString().trim())
        return out
    }

    // ---------------------------------------------------------------- griglia → giocatori

    private val HEADER_NOME = setOf("nome", "giocatore", "calciatore", "name")
    private val HEADER_RUOLO = setOf("ruolo", "r", "pos", "posizione")
    private val HEADER_QUOT = setOf("quotazione", "quot", "qt", "prezzo", "q base", "base", "fmm")

    fun daGriglia(righe: List<List<String>>): EsitoLista {
        if (righe.isEmpty()) return EsitoLista(emptyList(), listOf("File vuoto"), 0)
        val errori = ArrayList<String>()
        val avvisi = ArrayList<String>()

        val prima = righe.first().map { Ruolo.normalizza(it) }
        val hadHeader = prima.any { it in HEADER_NOME || it in HEADER_RUOLO || it in HEADER_QUOT }
        val colonne = if (hadHeader) {
            val nome = prima.indexOfFirst { it in HEADER_NOME }
            val ruolo = prima.indexOfFirst { it in HEADER_RUOLO }
            val quot = prima.indexOfFirst { it in HEADER_QUOT }
            if (nome < 0 || ruolo < 0) {
                errori.add("Intestazioni riconosciute ma manca la colonna ${if (nome < 0) "Nome" else "Ruolo"}")
                null
            } else Colonne(nome, ruolo, if (quot >= 0) quot else null).also {
                if (quot < 0) avvisi.add("Colonna quotazione non trovata: quotazioni a 0")
            }
        } else {
            if (righe.first().size < 2) errori.add("Servono almeno 2 colonne: Nome e Ruolo")
            else if (righe.first().size < 3) avvisi.add("Terza colonna assente: quotazioni a 0")
            Colonne(0, 1, if (righe.first().size >= 3) 2 else null)
        }
        if (colonne == null) return EsitoLista(emptyList(), errori, righe.size, avvisi)

        val giocatori = ArrayList<GiocatoreLista>()
        val nomiVisti = HashMap<String, Int>()
        righe.drop(if (hadHeader) 1 else 0).forEachIndexed { idx, riga ->
            val numRiga = idx + if (hadHeader) 2 else 1
            val nome = riga.getOrNull(colonne.nome)?.trim() ?: ""
            val ruoloTxt = riga.getOrNull(colonne.ruolo)?.trim() ?: ""
            if (nome.isEmpty() && ruoloTxt.isEmpty()) return@forEachIndexed // riga vuota
            if (nome.isEmpty()) { errori.add("Riga $numRiga: nome mancante"); return@forEachIndexed }
            val ruolo = Ruolo.daTesto(ruoloTxt)
            if (ruolo == null) { errori.add("Riga $numRiga: ruolo non riconosciuto \"$ruoloTxt\""); return@forEachIndexed }
            val qTxt = colonne.quotazione?.let { riga.getOrNull(it) } ?: ""
            val quotazione = parseIntero(qTxt)
            if (qTxt.isNotBlank() && quotazione == null)
                avvisi.add("Riga $numRiga: quotazione \"$qTxt\" non numerica → 0")
            giocatori.add(GiocatoreLista(id = giocatori.size, nome = nome, ruolo = ruolo, quotazioneBase = quotazione ?: 0))
            nomiVisti[nome.lowercase()] = (nomiVisti[nome.lowercase()] ?: 0) + 1
        }
        nomiVisti.filterValues { it > 1 }.keys.forEach {
            avvisi.add("Nome ripetuto nella lista: \"$it\"")
        }
        return EsitoLista(giocatori, errori, righe.size - 1, avvisi)
    }

    /** Accetta "50", "50,0", "50 FMM", "€ 50", "1.000" (punto migliaia). */
    fun parseIntero(s: String): Int? {
        val t = s.trim().replace(Regex("[^0-9,.]"), "")
        if (t.isEmpty()) return null
        val pulito = t.replace(".", "").replace(',', '.')
        return pulito.toDoubleOrNull()?.toInt()
    }
}
