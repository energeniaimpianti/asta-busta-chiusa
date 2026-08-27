package com.fantacalcio.astachiusa.core

import kotlin.math.max

/**
 * Motore dell'asta a busta chiusa: macchina a stati pura, verificata su JVM host.
 * Ogni operazione valida produce un evento append-only (spec SPEC.md, sezioni 1-3).
 */
data class StatoAsta(
    val config: ConfigLega = ConfigLega(),
    val partecipanti: List<Partecipante> = emptyList(),
    val lista: List<GiocatoreLista> = emptyList(),
    val listaById: Map<Int, GiocatoreLista> = emptyMap(),
    /** Id giocatori ancora da mettere all'asta, nell'ordine. */
    val coda: List<Int> = emptyList(),
    val corrente: GiocatoreLista? = null,
    val roundId: Int = 0,
    val fase: Fase = Fase.FINE,
    /** Offerte del round (o spareggio) corrente: idPartecipante → importo, 0 = passo/ritiro. */
    val offerte: Map<Int, Int> = emptyMap(),
    val candidatiSpareggio: Set<Int> = emptySet(),
    val offerteRoundPrincipale: Map<Int, Int> = emptyMap(),
    val ultimoSpareggio: Map<Int, Int> = emptyMap(),
    val spareggi: Int = 0,
    val squadre: Map<Int, Squadra> = emptyMap(),
    val nonVenduti: List<Int> = emptyList(),
    /** Numero di reinsertioni in coda già usate per giocatore (max 1). */
    val reinsertioni: Map<Int, Int> = emptyMap(),
    val rivelazione: Rivelazione? = null,
    val ultimaAggiudicazione: EventoAsta.Aggiudicazione? = null,
    val eventi: List<EventoAsta> = emptyList()
) {
    val tuttiCompleti: Boolean get() = squadre.values.all { it.completo(config.quote) }
}

sealed interface EsitoOfferta {
    data object Ok : EsitoOfferta
    data class Errore(val motivo: String) : EsitoOfferta
}

data class StatRuolo(val totale: Int, val venduti: Int, val svincolati: Int, val inCoda: Int)

class MotoreAsta {

    var stato: StatoAsta = StatoAsta()
        private set

    /** Ripristino da snapshot persistito (ripresa sessione). */
    fun ripristina(s: StatoAsta) {
        stato = s
    }

    /** Azzera il motore per una nuova asta. */
    fun reset() {
        stato = StatoAsta()
    }

    private fun ora(): Long = System.currentTimeMillis()

    /** Aggiunge un evento al log del NUOVO stato (da usare in coda a una copy). */
    private fun StatoAsta.conEvento(e: EventoAsta): StatoAsta = copy(eventi = eventi + e)

    // ---------------------------------------------------------------- avvio

    fun avvia(config: ConfigLega, partecipanti: List<Partecipante>, lista: List<GiocatoreLista>): StatoAsta {
        require(partecipanti.size >= 2) { "Servono almeno 2 partecipanti" }
        require(lista.isNotEmpty()) { "Lista giocatori vuota" }
        // Coda: reparti nell'ordine configurato; dentro il reparto, ordine del file (o shuffle con seed).
        val ordine = if (config.ordineCasuale) {
            val rnd = kotlin.random.Random(config.seed)
            config.ordineRuoli.flatMap { r -> lista.filter { it.ruolo == r }.shuffled(rnd) }
        } else {
            lista.sortedBy { config.ordineRuoli.indexOf(it.ruolo) }
        }
        val squadre = partecipanti.associate {
            it.id to Squadra(it.id, it.nome, config.budgetIniziale)
        }
        stato = StatoAsta(
            config = config,
            partecipanti = partecipanti,
            lista = lista,
            listaById = lista.associateBy { it.id },
            coda = ordine.map { it.id },
            squadre = squadre,
            fase = Fase.ATTESA_OFFERTE
        ).conEvento(
            EventoAsta.Inizio(config.nomeLega, partecipanti, config, lista, ora())
        )
        impostaCorrente(stato.coda.firstOrNull())
        return stato
    }

    private fun impostaCorrente(idGiocatore: Int?) {
        val g = idGiocatore?.let { stato.listaById[it] }
        stato = stato.copy(
            corrente = g,
            coda = if (idGiocatore == null) stato.coda else stato.coda.drop(1),
            roundId = stato.roundId + 1,
            fase = if (idGiocatore == null) Fase.FINE else Fase.ATTESA_OFFERTE,
            offerte = emptyMap(),
            offerteRoundPrincipale = emptyMap(),
            ultimoSpareggio = emptyMap(),
            candidatiSpareggio = emptySet(),
            spareggi = 0,
            rivelazione = null
        )
    }

    // ------------------------------------------------------ regole economiche

    fun maxOfferta(idPartecipante: Int): Int {
        val s = stato.squadre.getValue(idPartecipante)
        return if (!stato.config.regolaResto) s.budgetResiduo
        else max(0, s.budgetResiduo - (s.slotVuoti(stato.config.quote) - 1))
    }

    fun minOffertaCorrente(): Int {
        val g = stato.corrente ?: return 1
        return if (stato.config.baseComeMinimo) max(1, g.quotazioneBase) else 1
    }

    private fun minOffertaSpareggio(pariA: Int): Int =
        if (stato.config.spareggioDaPari) pariA + 1 else 1

    /** Idonei a puntare sul giocatore corrente (reparto non pieno e budget sufficiente). */
    fun idonei(): List<Partecipante> {
        val g = stato.corrente ?: return emptyList()
        val quota = stato.config.quote.getValue(g.ruolo)
        return stato.partecipanti.filter { p ->
            val s = stato.squadre.getValue(p.id)
            s.countRuolo(g.ruolo, stato.config.quote) < quota && maxOfferta(p.id) >= minOffertaCorrente()
        }
    }

    /** Partecipanti che devono ancora consegnare la busta nel round corrente. */
    fun interrogabili(): List<Partecipante> = when (stato.fase) {
        Fase.ATTESA_OFFERTE -> idonei().filter { it.id !in stato.offerte }
        Fase.SPAREGGIO -> stato.partecipanti.filter { it.id in stato.candidatiSpareggio && it.id !in stato.offerte }
        else -> emptyList()
    }

    fun statoBid(idPartecipante: Int): StatoBid {
        val p = stato.partecipanti.first { it.id == idPartecipante }
        return when (stato.fase) {
            Fase.ATTESA_OFFERTE -> {
                if (idPartecipante in stato.offerte) StatoBid.PUNTATO
                else if (!idonei().contains(p)) {
                    val g = stato.corrente
                    val quota = g?.let { stato.config.quote.getValue(it.ruolo) } ?: 0
                    val pieno = g != null &&
                        stato.squadre.getValue(idPartecipante).countRuolo(g.ruolo, stato.config.quote) >= quota
                    if (pieno) StatoBid.ESCLUSO_REPARTO else StatoBid.FUORI_BUDGET
                } else StatoBid.IN_ATTESA
            }
            Fase.SPAREGGIO ->
                when {
                    idPartecipante !in stato.candidatiSpareggio -> StatoBid.FUORI_SPAREGGIO
                    stato.offerte[idPartecipante] == 0 -> StatoBid.RITIRATO
                    idPartecipante in stato.offerte -> StatoBid.PUNTATO
                    else -> StatoBid.IN_ATTESA
                }
            else -> StatoBid.IN_ATTESA
        }
    }

    // ------------------------------------------------------------- offerte

    /**
     * Registra un'offerta segreta. Importo 0 = passo (o ritiro in spareggio).
     * Quando tutti gli interrogabili hanno consegnato, il round si chiude da solo.
     */
    fun offri(idPartecipante: Int, importo: Int): EsitoOfferta {
        val g = stato.corrente ?: return EsitoOfferta.Errore("Nessun giocatore all'asta")
        if (stato.fase != Fase.ATTESA_OFFERTE && stato.fase != Fase.SPAREGGIO)
            return EsitoOfferta.Errore("Fase non valida per un'offerta")
        val inSpareggio = stato.fase == Fase.SPAREGGIO
        if (inSpareggio && idPartecipante !in stato.candidatiSpareggio)
            return EsitoOfferta.Errore("Non candidato allo spareggio")
        if (!inSpareggio && !idonei().any { it.id == idPartecipante })
            return EsitoOfferta.Errore("Partecipante non idoneo per questo reparto")
        if (idPartecipante in stato.offerte)
            return EsitoOfferta.Errore("Offerta già registrata")
        val min = if (inSpareggio) minOffertaSpareggio(pariCorrente()) else minOffertaCorrente()
        if (importo != 0) {
            if (importo < min) return EsitoOfferta.Errore("Offerta minima: $min")
            if (importo > maxOfferta(idPartecipante)) return EsitoOfferta.Errore("Offerta massima: ${maxOfferta(idPartecipante)}")
        }
        stato = stato.copy(offerte = stato.offerte + (idPartecipante to importo)).conEvento(
            EventoAsta.OffertaRegistrata(stato.roundId, idPartecipante, importo, inSpareggio, ora())
        )
        if (interrogabili().isEmpty()) risolvi()
        return EsitoOfferta.Ok
    }

    private fun pariCorrente(): Int {
        val base = if (stato.spareggi > 0) stato.offerteRoundPrincipale else stato.offerte
        return base.values.maxOrNull() ?: 0
    }

    /** Il banditore chiude il round: le buste mancanti valgono 0. */
    fun forzaChiusura(): EsitoOfferta {
        if (stato.fase != Fase.ATTESA_OFFERTE && stato.fase != Fase.SPAREGGIO)
            return EsitoOfferta.Errore("Fase non valida per la chiusura")
        val mancanti = interrogabili().map { it.id }
        if (mancanti.isNotEmpty()) {
            stato = stato.copy(
                offerte = stato.offerte + mancanti.associateWith { 0 }
            ).conEvento(EventoAsta.ChiusuraForzata(stato.roundId, ora()))
        }
        risolvi()
        return EsitoOfferta.Ok
    }

    /** Il banditore salta definitivamente il giocatore corrente. */
    fun salta(): EsitoOfferta {
        val g = stato.corrente ?: return EsitoOfferta.Errore("Nessun giocatore all'asta")
        if (stato.fase != Fase.ATTESA_OFFERTE && stato.fase != Fase.SPAREGGIO)
            return EsitoOfferta.Errore("Fase non valida")
        val offerteVisibili = if (stato.spareggi > 0) stato.offerteRoundPrincipale else stato.offerte
        EventoAsta.SaltaGiocatore(g.id, ora()).let { ev ->
            stato = stato.copy(
                nonVenduti = stato.nonVenduti + g.id,
                rivelazione = costruisciRivelazione(g, offerteVisibili, null, 0, 0, emptyMap(), true, "saltato dal banditore"),
                fase = Fase.RIVELAZIONE
            ).conEvento(ev)
        }
        return EsitoOfferta.Ok
    }

    // -------------------------------------------------------------- risoluzione

    private fun risolvi() {
        val g = stato.corrente ?: return
        if (stato.fase == Fase.ATTESA_OFFERTE) {
            val valide = stato.offerte.filterValues { it > 0 }
            if (valide.isEmpty()) {
                nonVenduto(g, "nessuna offerta", requeue = true, base = stato.offerte)
                return
            }
            val maxV = valide.values.max()
            val vincitori = valide.filterValues { it == maxV }.keys
            if (vincitori.size == 1) {
                aggiudica(g, vincitori.first(), maxV, stato.offerte, spareggio = emptyMap())
            } else {
                stato = stato.copy(
                    fase = Fase.SPAREGGIO,
                    candidatiSpareggio = vincitori.toSet(),
                    offerteRoundPrincipale = stato.offerte,
                    ultimoSpareggio = emptyMap(),
                    offerte = emptyMap(),
                    spareggi = 1
                )
            }
        } else if (stato.fase == Fase.SPAREGGIO) {
            val attive = stato.offerte.filterValues { it > 0 }
            if (attive.isEmpty()) {
                nonVenduto(g, "tutti ritirati allo spareggio", requeue = true, base = stato.offerteRoundPrincipale)
                return
            }
            val maxV = attive.values.max()
            val vincitori = attive.filterValues { it == maxV }.keys
            if (vincitori.size == 1) {
                aggiudica(g, vincitori.first(), maxV, stato.offerteRoundPrincipale, spareggio = stato.offerte)
            } else {
                stato = stato.copy(
                    candidatiSpareggio = vincitori.toSet(),
                    ultimoSpareggio = stato.offerte,
                    offerte = emptyMap(),
                    spareggi = stato.spareggi + 1
                )
            }
        }
    }

    private fun aggiudica(
        g: GiocatoreLista,
        idVincitore: Int,
        importo: Int,
        offertePrincipali: Map<Int, Int>,
        spareggio: Map<Int, Int>
    ) {
        val s = stato.squadre.getValue(idVincitore)
        val squadra = s.copy(
            budgetResiduo = s.budgetResiduo - importo,
            rosa = s.rosa + Acquisto(g, importo)
        )
        val evento = EventoAsta.Aggiudicazione(
            stato.roundId, g.id, idVincitore, importo, stato.spareggi, ora()
        )
        stato = stato.copy(
            squadre = stato.squadre + (idVincitore to squadra),
            fase = Fase.RIVELAZIONE,
            rivelazione = costruisciRivelazione(
                g, offertePrincipali, idVincitore, importo, stato.spareggi, spareggio, false, ""
            ),
            ultimaAggiudicazione = evento
        ).conEvento(evento)
    }

    private fun nonVenduto(g: GiocatoreLista, motivo: String, requeue: Boolean, base: Map<Int, Int>) {
        val giaReinserito = (stato.reinsertioni[g.id] ?: 0) >= 1
        var nuovaCoda = stato.coda
        var reinsertioni = stato.reinsertioni
        if (requeue && !giaReinserito) {
            // Reinserto nel blocco del suo reparto: dopo l'ultimo giocatore dello stesso ruolo rimasto in coda.
            val idxUltimoStessoRuolo = nuovaCoda.indexOfLast { stato.listaById[it]?.ruolo == g.ruolo }
            nuovaCoda = if (idxUltimoStessoRuolo >= 0)
                nuovaCoda.toMutableList().apply { add(idxUltimoStessoRuolo + 1, g.id) }
            else nuovaCoda + g.id
            reinsertioni = reinsertioni + (g.id to 1)
        }
        val definitivo = !requeue || giaReinserito
        val evento = EventoAsta.NonVenduto(stato.roundId, g.id, motivo, ora())
        stato = stato.copy(
            coda = nuovaCoda,
            reinsertioni = reinsertioni,
            nonVenduti = if (definitivo) stato.nonVenduti + g.id else stato.nonVenduti,
            fase = Fase.RIVELAZIONE,
            rivelazione = costruisciRivelazione(g, base, null, 0, stato.spareggi, stato.ultimoSpareggio, true, motivo)
        ).conEvento(evento)
    }

    private fun costruisciRivelazione(
        g: GiocatoreLista,
        offertePrincipali: Map<Int, Int>,
        idVincitore: Int?,
        importoFinale: Int,
        spareggi: Int,
        spareggio: Map<Int, Int>,
        nonVenduto: Boolean,
        motivo: String
    ): Rivelazione {
        val nomeDi = { id: Int -> stato.partecipanti.firstOrNull { it.id == id }?.nome ?: " #$id" }
        val ordinate = offertePrincipali.entries
            .filter { it.value > 0 }
            .sortedWith(compareBy({ it.value }, { nomeDi(it.key) }))
            .map { OffertaRivelata(nomeDi(it.key), it.value) }
        val passi = offertePrincipali.entries
            .filter { it.value == 0 }
            .sortedBy { nomeDi(it.key) }
            .map { nomeDi(it.key) }
        val dettaglioSpareggio = spareggio.entries
            .filter { it.value > 0 }
            .sortedWith(compareBy({ it.value }, { nomeDi(it.key) }))
            .map { OffertaRivelata(nomeDi(it.key), it.value) }
        return Rivelazione(
            giocatore = g,
            offerteInOrdine = ordinate,
            passi = passi,
            vincitore = idVincitore?.let(nomeDi),
            idVincitore = idVincitore,
            importoFinale = importoFinale,
            spareggi = spareggi,
            spareggio = dettaglioSpareggio,
            nonVenduto = nonVenduto,
            motivoNonVenduto = motivo
        )
    }

    // ---------------------------------------------------------------- avanzamento

    /**
     * Dalla rivelazione si passa al giocatore successivo.
     * Un giocatore senza idonei è scartato in modo definitivo (reparto pieno per tutti).
     */
    fun prossimo(): StatoAsta {
        check(stato.fase == Fase.RIVELAZIONE) { "Prossimo consentito solo in rivelazione" }
        if (stato.coda.isEmpty() || stato.tuttiCompleti) {
            stato = stato.copy(fase = Fase.FINE, corrente = null, ultimaAggiudicazione = null)
            return stato
        }
        val idProssimo = stato.coda.first()
        val g = stato.listaById.getValue(idProssimo)
        val quota = stato.config.quote.getValue(g.ruolo)
        val qualcunoIdoneo = stato.partecipanti.any { p ->
            stato.squadre.getValue(p.id).countRuolo(g.ruolo, stato.config.quote) < quota &&
                maxOfferta(p.id) >= if (stato.config.baseComeMinimo) max(1, g.quotazioneBase) else 1
        }
        impostaCorrente(idProssimo)
        if (!qualcunoIdoneo) {
            val evento = EventoAsta.NonVenduto(stato.roundId, g.id, "nessuno idoneo (reparto pieno)", ora())
            stato = stato.copy(
                nonVenduti = stato.nonVenduti + g.id,
                fase = Fase.RIVELAZIONE,
                rivelazione = costruisciRivelazione(g, emptyMap(), null, 0, 0, emptyMap(), true, "nessuno idoneo")
            ).conEvento(evento)
        }
        return stato
    }

    /** Annulla l'aggiudicazione appena conclusa e rimette subito il giocatore all'asta. */
    fun annullaUltimaAggiudicazione(): EsitoOfferta {
        val agg = stato.ultimaAggiudicazione
            ?: return EsitoOfferta.Errore("Nessuna aggiudicazione da annullare")
        if (stato.fase != Fase.RIVELAZIONE || agg.roundId != stato.roundId)
            return EsitoOfferta.Errore("Si può annullare solo l'ultima aggiudicazione, prima di proseguire")
        val g = stato.listaById.getValue(agg.idGiocatore)
        val s = stato.squadre.getValue(agg.idPartecipante)
        val squadra = s.copy(
            budgetResiduo = s.budgetResiduo + agg.importo,
            rosa = s.rosa.filterNot { it.giocatore.id == g.id }
        )
        stato = stato.copy(
            squadre = stato.squadre + (agg.idPartecipante to squadra),
            fase = Fase.ATTESA_OFFERTE,
            offerte = emptyMap(),
            offerteRoundPrincipale = emptyMap(),
            ultimoSpareggio = emptyMap(),
            candidatiSpareggio = emptySet(),
            spareggi = 0,
            rivelazione = null,
            ultimaAggiudicazione = null
        ).conEvento(
            EventoAsta.AnnullamentoAggiudicazione(agg.roundId, agg.idGiocatore, agg.idPartecipante, agg.importo, ora())
        )
        return EsitoOfferta.Ok
    }

    fun termina(): StatoAsta {
        if (stato.fase != Fase.FINE)
            stato = stato.copy(fase = Fase.FINE, corrente = null, ultimaAggiudicazione = null)
                .conEvento(EventoAsta.TermineAnticipato(ora()))
        return stato
    }

    // ---------------------------------------------------------------- statistiche

    fun statistiche(): Map<Ruolo, StatRuolo> {
        val venduti = stato.squadre.values.flatMap { it.rosa }.map { it.giocatore.id }.toSet()
        return Ruolo.entries.associateWith { r ->
            val delRuolo = stato.lista.filter { it.ruolo == r }.map { it.id }
            StatRuolo(
                totale = delRuolo.size,
                venduti = delRuolo.count { it in venduti },
                svincolati = delRuolo.count { it in stato.nonVenduti },
                inCoda = delRuolo.count { it in stato.coda }
            )
        }
    }
}

/**
 * Testo dell'annuncio a voce: si pronunciano SOLO i primi 4 partecipanti per importo
 * (i 4 punteggi più alti, in ordine crescente), zero esclusi, chiusura sul vincitore.
 * Con meno di 4 offerte valide si dicono tutte.
 */
const val MASSIMO_OFFERTE_PRONUNCIATE = 4

fun testoAnnuncio(r: Rivelazione): String = buildString {
    append("Asta chiusa per ${r.giocatore.nome}. ")
    val daDire = r.offerteInOrdine.takeLast(MASSIMO_OFFERTE_PRONUNCIATE)
    if (r.nonVenduto) {
        if (r.offerteInOrdine.isEmpty()) {
            append(
                if (r.motivoNonVenduto == "saltato dal banditore") "Il banditore ha saltato il giocatore. "
                else "Nessuna offerta. "
            )
            append("${r.giocatore.nome} resta svincolato.")
        } else {
            daDire.forEach { append("${it.partecipante} ha offerto ${it.importo}. ") }
            append("Spareggio non andato a buon fine. ${r.giocatore.nome} resta svincolato.")
        }
    } else {
        daDire.forEach { append("${it.partecipante} ha offerto ${it.importo}. ") }
        if (r.spareggi > 0) {
            append("Pareggio in cima, spareggio. ")
            r.spareggio.forEach { append("${it.partecipante} ha offerto ${it.importo}. ") }
        }
        append("${r.giocatore.nome} è aggiudicato a ${r.vincitore} per ${r.importoFinale} fantamilioni!")
    }
}

/** Esportazione CSV delle squadre (separatore ';', campi sempre virgolettati). */
fun esportaCsv(s: StatoAsta): String = buildString {
    fun q(v: Any) = "\"" + v.toString().replace("\"", "\"\"") + "\""
    appendLine("${q("Partecipante")};${q("Ruolo")};${q("Giocatore")};${q("Importo")};${q("Budget residuo")}")
    for (p in s.partecipanti) {
        val squadra = s.squadre.getValue(p.id)
        for (ruolo in s.config.ordineRuoli) {
            for (a in squadra.rosa.filter { it.giocatore.ruolo == ruolo }) {
                appendLine("${q(p.nome)};${q(ruolo.codice)};${q(a.giocatore.nome)};${a.importo};${squadra.budgetResiduo}")
            }
        }
    }
    appendLine()
    appendLine("${q("RIEPILOGO")};${q("Speso")};${q("Budget residuo")};${q("Rosa")};${q("Slot vuoti")}")
    for (p in s.partecipanti) {
        val squadra = s.squadre.getValue(p.id)
        val speso = squadra.rosa.sumOf { it.importo }
        appendLine(
            "${q(p.nome)};$speso;${squadra.budgetResiduo};${squadra.rosa.size};" +
                q(squadra.rosa.joinToString(" ") { it.giocatore.ruolo.codice })
        )
    }
    if (s.nonVenduti.isNotEmpty()) {
        appendLine()
        appendLine("${q("SVINCOLATI")};${q("Ruolo")}")
        s.nonVenduti.mapNotNull { s.listaById[it] }.forEach {
            appendLine("${q(it.nome)};${q(it.ruolo.codice)}")
        }
    }
}
