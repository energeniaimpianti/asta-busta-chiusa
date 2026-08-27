package com.fantacalcio.astachiusa.core

/**
 * Modello di dominio dell'asta a busta chiusa.
 * Questo file è Kotlin puro (nessuna dipendenza Android): viene verificato su JVM host.
 */

enum class Ruolo(val codice: String, val etichetta: String) {
    P("P", "Portieri"),
    D("D", "Difensori"),
    C("C", "Centrocampisti"),
    A("A", "Attaccanti");

    companion object {
        /** Normalizza testi tipo "P", "POR", "Portiere", "GK", "ATT", "ST" nel ruolo corrispondente. */
        fun daTesto(testo: String): Ruolo? {
            val n = normalizza(testo) // già minuscolo e senza accenti
            return when (n) {
                "p", "por", "portiere", "portieri", "gk", "pt" -> P
                "d", "dif", "difensore", "difensori", "def", "df", "td" -> D
                "c", "cen", "centrocampista", "centrocampisti", "mid", "mf", "cc", "tq" -> C
                "a", "att", "attaccante", "attaccanti", "st", "fw", "w" -> A
                else -> null
            }
        }

        /** Minuscolo, senza accenti e spazi superflui. */
        fun normalizza(s: String): String {
            val base = java.text.Normalizer.normalize(s.trim(), java.text.Normalizer.Form.NFD)
                .replace(Regex("\\p{M}+"), "")
                .lowercase()
            return base.replace(Regex("\\s+"), " ")
        }
    }
}

data class GiocatoreLista(
    val id: Int,
    val nome: String,
    val ruolo: Ruolo,
    val quotazioneBase: Int
)

data class Partecipante(val id: Int, val nome: String)

data class ConfigLega(
    val nomeLega: String = "La mia lega",
    val budgetIniziale: Int = 500,
    /** Dimensione dei reparti della rosa: default 3 P, 8 D, 8 C, 6 A (rosa da 25). */
    val quote: Map<Ruolo, Int> = mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6),
    /** Ordine di asta dei reparti: default Attaccanti → Centrocampisti → Portieri → Difensori. */
    val ordineRuoli: List<Ruolo> = listOf(Ruolo.A, Ruolo.C, Ruolo.P, Ruolo.D),
    /** Regola del resto: offerta massima = budget − (slot vuoti − 1), per garantire 1 FMM per posto. */
    val regolaResto: Boolean = true,
    /** Usa la quotazione base del file come offerta minima per quel giocatore. */
    val baseComeMinimo: Boolean = false,
    /** Mescola l'ordine dei giocatori dentro ciascun reparto (seed registrato, riproducibile). */
    val ordineCasuale: Boolean = false,
    val seed: Long = 2026,
    /** Spareggio: le nuove offerte partono da pari_offerta + 1 (se false: da 1). */
    val spareggioDaPari: Boolean = true
) {
    val totaleSlot: Int get() = quote.values.sum()
}

data class Acquisto(val giocatore: GiocatoreLista, val importo: Int)

data class Squadra(
    val idPartecipante: Int,
    val nome: String,
    val budgetResiduo: Int,
    val rosa: List<Acquisto> = emptyList()
) {
    fun countRuolo(r: Ruolo, quote: Map<Ruolo, Int>): Int = rosa.count { it.giocatore.ruolo == r }
    fun slotVuoti(quote: Map<Ruolo, Int>): Int = quote.values.sum() - rosa.size
    fun completo(quote: Map<Ruolo, Int>): Boolean = slotVuoti(quote) == 0
}

/** Singola offerta rivelata: importo 0 = passo. */
data class OffertaRivelata(val partecipante: String, val importo: Int)

/** Esito della busta, pronto per l'annuncio a voce. */
data class Rivelazione(
    val giocatore: GiocatoreLista,
    /** Offerte > 0 in ordine crescente; il vincitore è l'ultimo (se presente). */
    val offerteInOrdine: List<OffertaRivelata>,
    /** Nomi di chi ha passato (offerta 0). */
    val passi: List<String>,
    val vincitore: String? = null,
    val idVincitore: Int? = null,
    val importoFinale: Int = 0,
    val spareggi: Int = 0,
    /** Dettaglio dell'ultimo spareggio, se avvenuto. */
    val spareggio: List<OffertaRivelata> = emptyList(),
    /** true se il giocatore non è stato venduto. */
    val nonVenduto: Boolean = false,
    val motivoNonVenduto: String = ""
)

enum class Fase { ATTESA_OFFERTE, SPAREGGIO, RIVELAZIONE, FINE }

/** Stato di un partecipante rispetto al giocatore correntemente all'asta. */
enum class StatoBid(val etichetta: String) {
    IN_ATTESA("In attesa"),
    PUNTATO("Puntato"),
    ESCLUSO_REPARTO("Reparto completo"),
    FUORI_BUDGET("Budget insufficiente"),
    FUORI_SPAREGGIO("Fuori spareggio"),
    RITIRATO("Ritirato")
}

sealed interface EventoAsta {
    val ts: Long

    data class Inizio(
        val nomeLega: String,
        val partecipanti: List<Partecipante>,
        val config: ConfigLega,
        val lista: List<GiocatoreLista>,
        override val ts: Long
    ) : EventoAsta

    data class OffertaRegistrata(
        val roundId: Int,
        val idPartecipante: Int,
        val importo: Int,
        val spareggio: Boolean,
        override val ts: Long
    ) : EventoAsta

    data class ChiusuraForzata(val roundId: Int, override val ts: Long) : EventoAsta

    data class Aggiudicazione(
        val roundId: Int,
        val idGiocatore: Int,
        val idPartecipante: Int,
        val importo: Int,
        val spareggi: Int,
        override val ts: Long
    ) : EventoAsta

    data class NonVenduto(
        val roundId: Int,
        val idGiocatore: Int,
        val motivo: String,
        override val ts: Long
    ) : EventoAsta

    data class SaltaGiocatore(val idGiocatore: Int, override val ts: Long) : EventoAsta

    data class AnnullamentoAggiudicazione(
        val roundId: Int,
        val idGiocatore: Int,
        val idPartecipante: Int,
        val importo: Int,
        override val ts: Long
    ) : EventoAsta

    data class TermineAnticipato(override val ts: Long) : EventoAsta
}
