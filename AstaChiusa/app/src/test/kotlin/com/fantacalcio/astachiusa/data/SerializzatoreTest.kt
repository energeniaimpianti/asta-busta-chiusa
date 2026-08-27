package com.fantacalcio.astachiusa.data

import com.fantacalcio.astachiusa.core.ConfigLega
import com.fantacalcio.astachiusa.core.Fase
import com.fantacalcio.astachiusa.core.GiocatoreLista
import com.fantacalcio.astachiusa.core.MotoreAsta
import com.fantacalcio.astachiusa.core.Partecipante
import com.fantacalcio.astachiusa.core.Ruolo
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round-trip di serializzazione su JVM host (org.json reale come dipendenza di test).
 * Questo test esiste perché la v1.0.0 crashava su Android: JSONObject(Map) con
 * chiavi Int → ClassCastException nell'org.json di Android. La serializzazione è
 * ora interamente in SerializzatoreStato con put() espliciti a chiavi String.
 */
class SerializzatoreTest {

    private fun lista(): List<GiocatoreLista> = listOf(
        GiocatoreLista(0, "Attaccante Uno", Ruolo.A, 20),
        GiocatoreLista(1, "Attaccante Due", Ruolo.A, 20),
        GiocatoreLista(2, "Centrocampista Uno", Ruolo.C, 20),
        GiocatoreLista(3, "Centrocampista Due", Ruolo.C, 20),
        GiocatoreLista(4, "Portiere Uno", Ruolo.P, 20),
        GiocatoreLista(5, "Difensore Uno", Ruolo.D, 20)
    )

    private fun motoreConMossa(): MotoreAsta {
        val m = MotoreAsta()
        m.avvia(
            ConfigLega(
                nomeLega = "Test RT",
                quote = mapOf(Ruolo.P to 1, Ruolo.D to 1, Ruolo.C to 1, Ruolo.A to 1)
            ),
            (1..8).map { Partecipante(it, "P$it") },
            lista()
        )
        // round 1: P1 vince a 12, gli altri passano
        m.offri(1, 12); (2..8).forEach { m.offri(it, 0) }
        return m
    }

    @Test
    fun `round trip completo dello stato dopo aggiudicazione`() {
        val m = motoreConMossa()
        val s1 = m.stato
        val json = SerializzatoreStato.statoJson(s1).toString()
        val s2 = SerializzatoreStato.statoDaJson(JSONObject(json))
        // il caricamento non riporta in memoria gli eventi: azzeriamoli anche nell'originale
        assertEquals(s1.copy(eventi = emptyList()), s2)
    }

    @Test
    fun `round trip in fase spareggio`() {
        val m = MotoreAsta()
        m.avvia(
            ConfigLega(quote = mapOf(Ruolo.P to 1, Ruolo.D to 1, Ruolo.C to 1, Ruolo.A to 1)),
            (1..4).map { Partecipante(it, "P$it") },
            lista()
        )
        m.offri(1, 20); m.offri(2, 20); m.offri(3, 0); m.offri(4, 0)
        org.junit.Assert.assertEquals(Fase.SPAREGGIO, m.stato.fase)
        val s1 = m.stato
        val s2 = SerializzatoreStato.statoDaJson(JSONObject(SerializzatoreStato.statoJson(s1).toString()))
        assertEquals(s1.copy(eventi = emptyList()), s2)
        assertEquals(setOf(1, 2), s2.candidatiSpareggio)
        // il motore riprende lo stato e la partita continua
        val m2 = MotoreAsta().apply { ripristina(s2) }
        m2.offri(1, 21); m2.offri(2, 0)
        org.junit.Assert.assertEquals("P1", m2.stato.rivelazione?.vincitore)
        assertEquals(21, m2.stato.rivelazione?.importoFinale)
    }

    @Test
    fun `round trip dopo non venduto con reinserto e rivelazione`() {
        val m = MotoreAsta()
        m.avvia(
            ConfigLega(quote = mapOf(Ruolo.P to 1, Ruolo.D to 1, Ruolo.C to 1, Ruolo.A to 1)),
            (1..4).map { Partecipante(it, "P$it") },
            lista()
        )
        m.forzaChiusura() // tutti passano → non venduto, reinserto
        val s1 = m.stato
        val s2 = SerializzatoreStato.statoDaJson(JSONObject(SerializzatoreStato.statoJson(s1).toString()))
        assertEquals(s1.copy(eventi = emptyList()), s2)
        assertTrue(s2.rivelazione?.nonVenduto == true)
        assertEquals(1, s2.reinsertioni[0])
        // reinserto = ancora in coda, NON tra gli svincolati definitivi
        assertTrue(s2.nonVenduti.isEmpty())
        org.junit.Assert.assertTrue(s2.coda.contains(0))
    }

    @Test
    fun `tutti i tipi di evento fanno round trip identico`() {
        val m = MotoreAsta()
        m.avvia(
            ConfigLega(quote = mapOf(Ruolo.P to 1, Ruolo.D to 1, Ruolo.C to 1, Ruolo.A to 1)),
            (1..3).map { Partecipante(it, "P$it") },
            lista()
        )
        m.offri(1, 8); m.offri(2, 5); m.offri(3, 0)          // aggiudicazione P1
        m.prossimo()
        m.offri(1, 3)                                        // offerta round 2
        m.forzaChiusura()                                     // chiusura forzata (2,3 mancanti → 0) → P1 di nuovo? no: P1 3 vs 0,0
        m.prossimo()
        m.salta()                                             // salta giocatore
        m.prossimo()
        m.offri(1, 4); m.offri(2, 4); m.offri(3, 0)           // spareggio 1v2
        m.offri(1, 0); m.offri(2, 0)                           // entrambi ritirati → non venduto
        m.prossimo()
        m.annullaUltimaAggiudicazione()                        // errore controllato (non c'è) → ok comunque
        m.termina()
        val tipi = m.stato.eventi.map { it::class.simpleName }.toSet()
        org.junit.Assert.assertTrue(tipi.containsAll(listOf("Inizio", "OffertaRegistrata", "Aggiudicazione", "ChiusuraForzata", "SaltaGiocatore", "NonVenduto", "TermineAnticipato")))
        m.stato.eventi.forEach { e ->
            val rt = SerializzatoreStato.eventoDaJson(SerializzatoreStato.eventoJson(e))
            assertEquals("round trip evento ${e::class.simpleName}", e, rt)
        }
    }

    @Test
    fun `il json prodotto ha solo chiavi stringa nelle mappe`() {
        val m = motoreConMossa()
        val json = SerializzatoreStato.statoJson(m.stato)
        val squadre = json.getJSONObject("squadre")
        squadre.keys().forEach { k -> assertTrue("chiave squadre non numerica: $k", k.matches(Regex("\\d+"))) }
        val offerte = json.getJSONObject("offerte")
        offerte.keys().forEach { k -> assertTrue(k.matches(Regex("\\d+"))) }
        val quote = json.getJSONObject("config").getJSONObject("quote")
        quote.keys().forEach { k -> assertTrue(k in setOf("P", "D", "C", "A")) }
    }
}
