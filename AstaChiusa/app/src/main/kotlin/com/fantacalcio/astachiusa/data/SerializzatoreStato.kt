package com.fantacalcio.astachiusa.data

import com.fantacalcio.astachiusa.core.*
import org.json.JSONArray
import org.json.JSONObject

/**
 * Serializzazione dello stato dell'asta in JSON (org.json).
 *
 * REGOLA INDISPENSABILE (lezione del crash v1.0.0 su Android): MAI usare il
 * costruttore JSONObject(Map) con chiavi non-String — l'implementazione Android
 * di org.json fa il cast (String) della chiave e lancia ClassCastException.
 * Qui ogni JSONObject viene costruito con put() espliciti a chiavi String.
 * Questo file non dipende da Android: è verificato su JVM host.
 */
object SerializzatoreStato {

    private fun JSONObject.putInt(k: String, v: Int): JSONObject = put(k, v)
    private fun JSONObject.putIntOrNull(k: String, v: Int?): JSONObject =
        if (v == null) put(k, JSONObject.NULL) else put(k, v)
    private fun JSONObject.putStringOrNull(k: String, v: String?): JSONObject =
        if (v == null) put(k, JSONObject.NULL) else put(k, v)

    private fun mappaIntJson(m: Map<Int, Int>): JSONObject {
        val o = JSONObject()
        m.forEach { (k, v) -> o.put(k.toString(), v) }
        return o
    }

    private fun mappaIntDaJson(o: JSONObject): Map<Int, Int> {
        val out = HashMap<Int, Int>()
        o.keys().forEach { k -> out[k.toInt()] = o.getInt(k) }
        return out
    }

    private fun mappaRuoloJson(m: Map<Ruolo, Int>): JSONObject {
        val o = JSONObject()
        m.forEach { (k, v) -> o.put(k.name, v) }
        return o
    }

    private fun listaJson(items: List<Any>): JSONArray {
        val a = JSONArray()
        items.forEach { a.put(it) }
        return a
    }

    // ------------------------------------------------------------------ stato

    fun statoJson(s: StatoAsta): JSONObject = JSONObject().apply {
        put("versione", 1)
        put("config", configJson(s.config))
        put("partecipanti", listaJson(s.partecipanti.map { JSONObject().put("id", it.id).put("nome", it.nome) }))
        put("lista", listaJson(s.lista.map { giocatoreJson(it) }))
        put("coda", listaJson(s.coda))
        putIntOrNull("correnteId", s.corrente?.id)
        putInt("roundId", s.roundId)
        put("fase", s.fase.name)
        put("offerte", mappaIntJson(s.offerte))
        put("candidatiSpareggio", listaJson(s.candidatiSpareggio.toList()))
        put("offerteRoundPrincipale", mappaIntJson(s.offerteRoundPrincipale))
        put("ultimoSpareggio", mappaIntJson(s.ultimoSpareggio))
        putInt("spareggi", s.spareggi)
        put("squadre", squadreJson(s.squadre))
        put("nonVenduti", listaJson(s.nonVenduti))
        put("reinsertioni", mappaIntJson(s.reinsertioni))
        put("rivelazione", s.rivelazione?.let { rivelazioneJson(it) } ?: JSONObject.NULL)
        put("ultimaAggiudicazione", s.ultimaAggiudicazione?.let { eventoJson(it) } ?: JSONObject.NULL)
    }

    private fun squadreJson(squadre: Map<Int, Squadra>): JSONObject {
        val o = JSONObject()
        squadre.forEach { (id, sq) -> o.put(id.toString(), squadraJson(id, sq)) }
        return o
    }

    fun statoDaJson(o: JSONObject): StatoAsta {
        val config = configDaJson(o.getJSONObject("config"))
        val lista = o.getJSONArray("lista").mapOggetti { giocatoreDaJson(it) }
        val listaById = lista.associateBy { it.id }
        val correnteId = if (o.isNull("correnteId")) null else o.getInt("correnteId")
        val rivel = if (o.isNull("rivelazione")) null else rivelazioneDaJson(o.getJSONObject("rivelazione"), listaById)
        val ultima =
            if (o.isNull("ultimaAggiudicazione")) null
            else eventoDaJson(o.getJSONObject("ultimaAggiudicazione")) as EventoAsta.Aggiudicazione
        return StatoAsta(
            config = config,
            partecipanti = o.getJSONArray("partecipanti").mapOggetti {
                Partecipante(it.getInt("id"), it.getString("nome"))
            },
            lista = lista,
            listaById = listaById,
            coda = o.getJSONArray("coda").aInt(),
            corrente = correnteId?.let { listaById[it] },
            roundId = o.getInt("roundId"),
            fase = Fase.valueOf(o.getString("fase")),
            offerte = mappaIntDaJson(o.getJSONObject("offerte")),
            candidatiSpareggio = o.getJSONArray("candidatiSpareggio").aInt().toSet(),
            offerteRoundPrincipale = mappaIntDaJson(o.getJSONObject("offerteRoundPrincipale")),
            ultimoSpareggio = mappaIntDaJson(o.getJSONObject("ultimoSpareggio")),
            spareggi = o.getInt("spareggi"),
            squadre = HashMap<Int, Squadra>().apply {
                val sq = o.getJSONObject("squadre")
                sq.keys().forEach { k -> put(k.toInt(), squadraDaJson(sq.getJSONObject(k), listaById)) }
            },
            nonVenduti = o.getJSONArray("nonVenduti").aInt(),
            reinsertioni = mappaIntDaJson(o.getJSONObject("reinsertioni")),
            rivelazione = rivel,
            ultimaAggiudicazione = ultima,
            eventi = emptyList()
        )
    }

    private fun configJson(c: ConfigLega): JSONObject = JSONObject().apply {
        put("nomeLega", c.nomeLega)
        put("budgetIniziale", c.budgetIniziale)
        put("quote", mappaRuoloJson(c.quote))
        put("ordineRuoli", listaJson(c.ordineRuoli.map { it.name }))
        put("regolaResto", c.regolaResto)
        put("baseComeMinimo", c.baseComeMinimo)
        put("ordineCasuale", c.ordineCasuale)
        put("seed", c.seed)
        put("spareggioDaPari", c.spareggioDaPari)
    }

    private fun configDaJson(o: JSONObject): ConfigLega = ConfigLega(
        nomeLega = o.getString("nomeLega"),
        budgetIniziale = o.getInt("budgetIniziale"),
        quote = HashMap<Ruolo, Int>().apply {
            val q = o.getJSONObject("quote")
            q.keys().forEach { put(Ruolo.valueOf(it), q.getInt(it)) }
        },
        ordineRuoli = o.getJSONArray("ordineRuoli").aStringhe().map { Ruolo.valueOf(it) },
        regolaResto = o.getBoolean("regolaResto"),
        baseComeMinimo = o.getBoolean("baseComeMinimo"),
        ordineCasuale = o.getBoolean("ordineCasuale"),
        seed = o.getLong("seed"),
        spareggioDaPari = o.getBoolean("spareggioDaPari")
    )

    private fun giocatoreJson(g: GiocatoreLista): JSONObject =
        JSONObject().put("id", g.id).put("nome", g.nome).put("ruolo", g.ruolo.name).put("quotazioneBase", g.quotazioneBase)

    private fun giocatoreDaJson(o: JSONObject): GiocatoreLista = GiocatoreLista(
        o.getInt("id"), o.getString("nome"), Ruolo.valueOf(o.getString("ruolo")), o.getInt("quotazioneBase")
    )

    private fun squadraJson(id: Int, s: Squadra): JSONObject = JSONObject().apply {
        put("idPartecipante", id)
        put("nome", s.nome)
        put("budgetResiduo", s.budgetResiduo)
        put("rosa", listaJson(s.rosa.map {
            JSONObject().put("idGiocatore", it.giocatore.id).put("importo", it.importo)
        }))
    }

    private fun squadraDaJson(o: JSONObject, listaById: Map<Int, GiocatoreLista>): Squadra = Squadra(
        idPartecipante = o.getInt("idPartecipante"),
        nome = o.getString("nome"),
        budgetResiduo = o.getInt("budgetResiduo"),
        rosa = o.getJSONArray("rosa").mapOggetti {
            Acquisto(listaById.getValue(it.getInt("idGiocatore")), it.getInt("importo"))
        }
    )

    private fun rivelazioneJson(r: Rivelazione): JSONObject = JSONObject().apply {
        put("idGiocatore", r.giocatore.id)
        put("offerte", listaJson(r.offerteInOrdine.map { JSONObject().put("p", it.partecipante).put("i", it.importo) }))
        put("passi", listaJson(r.passi))
        putStringOrNull("vincitore", r.vincitore)
        putIntOrNull("idVincitore", r.idVincitore)
        putInt("importoFinale", r.importoFinale)
        putInt("spareggi", r.spareggi)
        put("spareggio", listaJson(r.spareggio.map { JSONObject().put("p", it.partecipante).put("i", it.importo) }))
        put("nonVenduto", r.nonVenduto)
        put("motivoNonVenduto", r.motivoNonVenduto)
    }

    private fun rivelazioneDaJson(o: JSONObject, listaById: Map<Int, GiocatoreLista>): Rivelazione =
        Rivelazione(
            giocatore = listaById[o.getInt("idGiocatore")] ?: GiocatoreLista(-1, "?", Ruolo.P, 0),
            offerteInOrdine = o.getJSONArray("offerte").mapOggetti {
                OffertaRivelata(it.getString("p"), it.getInt("i"))
            },
            passi = o.getJSONArray("passi").aStringhe(),
            vincitore = if (o.isNull("vincitore")) null else o.getString("vincitore"),
            idVincitore = if (o.isNull("idVincitore")) null else o.getInt("idVincitore"),
            importoFinale = o.getInt("importoFinale"),
            spareggi = o.getInt("spareggi"),
            spareggio = o.getJSONArray("spareggio").mapOggetti {
                OffertaRivelata(it.getString("p"), it.getInt("i"))
            },
            nonVenduto = o.getBoolean("nonVenduto"),
            motivoNonVenduto = o.optString("motivoNonVenduto", "")
        )

    // ------------------------------------------------------------------ eventi

    fun eventoJson(e: EventoAsta): JSONObject = JSONObject().apply {
        put("tipo", e::class.simpleName)
        put("ts", e.ts)
        when (e) {
            is EventoAsta.Inizio -> {
                put("nomeLega", e.nomeLega)
                put("config", configJson(e.config))
                put("partecipanti", listaJson(e.partecipanti.map { JSONObject().put("id", it.id).put("nome", it.nome) }))
                put("lista", listaJson(e.lista.map { giocatoreJson(it) }))
            }
            is EventoAsta.OffertaRegistrata -> {
                putInt("roundId", e.roundId); putInt("idPartecipante", e.idPartecipante)
                putInt("importo", e.importo); put("spareggio", e.spareggio)
            }
            is EventoAsta.ChiusuraForzata -> putInt("roundId", e.roundId)
            is EventoAsta.Aggiudicazione -> {
                putInt("roundId", e.roundId); putInt("idGiocatore", e.idGiocatore)
                putInt("idPartecipante", e.idPartecipante); putInt("importo", e.importo); putInt("spareggi", e.spareggi)
            }
            is EventoAsta.NonVenduto -> {
                putInt("roundId", e.roundId); putInt("idGiocatore", e.idGiocatore); put("motivo", e.motivo)
            }
            is EventoAsta.SaltaGiocatore -> putInt("idGiocatore", e.idGiocatore)
            is EventoAsta.AnnullamentoAggiudicazione -> {
                putInt("roundId", e.roundId); putInt("idGiocatore", e.idGiocatore)
                putInt("idPartecipante", e.idPartecipante); putInt("importo", e.importo)
            }
            is EventoAsta.TermineAnticipato -> {}
        }
    }

    fun eventoDaJson(o: JSONObject): EventoAsta {
        val ts = o.getLong("ts")
        return when (o.getString("tipo")) {
            "Inizio" -> EventoAsta.Inizio(
                o.getString("nomeLega"),
                o.getJSONArray("partecipanti").mapOggetti { Partecipante(it.getInt("id"), it.getString("nome")) },
                configDaJson(o.getJSONObject("config")),
                o.getJSONArray("lista").mapOggetti { giocatoreDaJson(it) },
                ts
            )
            "OffertaRegistrata" -> EventoAsta.OffertaRegistrata(
                o.getInt("roundId"), o.getInt("idPartecipante"), o.getInt("importo"), o.getBoolean("spareggio"), ts
            )
            "ChiusuraForzata" -> EventoAsta.ChiusuraForzata(o.getInt("roundId"), ts)
            "Aggiudicazione" -> EventoAsta.Aggiudicazione(
                o.getInt("roundId"), o.getInt("idGiocatore"), o.getInt("idPartecipante"),
                o.getInt("importo"), o.getInt("spareggi"), ts
            )
            "NonVenduto" -> EventoAsta.NonVenduto(
                o.getInt("roundId"), o.getInt("idGiocatore"), o.getString("motivo"), ts
            )
            "SaltaGiocatore" -> EventoAsta.SaltaGiocatore(o.getInt("idGiocatore"), ts)
            "AnnullamentoAggiudicazione" -> EventoAsta.AnnullamentoAggiudicazione(
                o.getInt("roundId"), o.getInt("idGiocatore"), o.getInt("idPartecipante"), o.getInt("importo"), ts
            )
            "TermineAnticipato" -> EventoAsta.TermineAnticipato(ts)
            else -> EventoAsta.TermineAnticipato(ts)
        }
    }

    // ------------------------------------------------------------------ utility

    private fun <T> JSONArray.mapOggetti(f: (JSONObject) -> T): List<T> =
        (0 until length()).map { f(getJSONObject(it)) }

    private fun JSONArray.aInt(): List<Int> = (0 until length()).map { getInt(it) }

    private fun JSONArray.aStringhe(): List<String> = (0 until length()).map { getString(it) }
}
