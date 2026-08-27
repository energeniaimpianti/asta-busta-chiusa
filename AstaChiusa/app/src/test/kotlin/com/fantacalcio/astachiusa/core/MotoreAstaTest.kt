package com.fantacalcio.astachiusa.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MotoreAstaTest {

    private fun lista(minimo: Int = 2): List<GiocatoreLista> {
        val g = ArrayList<GiocatoreLista>()
        var id = 0
        fun add(nome: String, ruolo: Ruolo, q: Int = 20) { g.add(GiocatoreLista(id++, nome, ruolo, q)); }
        // 2 attaccanti, 2 centrocampisti, 1 portiere, 1 difensore
        add("Attaccante Uno", Ruolo.A); add("Attaccante Due", Ruolo.A)
        add("Centrocampista Uno", Ruolo.C); add("Centrocampista Due", Ruolo.C)
        add("Portiere Uno", Ruolo.P); add("Difensore Uno", Ruolo.D)
        return g
    }

    private fun partecipanti(n: Int = 8) = (1..n).map { Partecipante(it, "P$it") }

    private fun config(
        quote: Map<Ruolo, Int> = mapOf(Ruolo.P to 1, Ruolo.D to 1, Ruolo.C to 1, Ruolo.A to 1),
        ordine: List<Ruolo> = listOf(Ruolo.A, Ruolo.C, Ruolo.P, Ruolo.D),
        budget: Int = 500,
        resto: Boolean = true,
        spareggioDaPari: Boolean = true
    ) = ConfigLega(
        nomeLega = "Test", budgetIniziale = budget, quote = quote, ordineRuoli = ordine,
        regolaResto = resto, spareggioDaPari = spareggioDaPari
    )

    @Test
    fun `ordine coda segue ordine ruoli A C P D con reinserto singolo`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        // Asta in cui tutti passano sempre: ogni giocatore è non venduto, reinserito una volta
        // nel blocco del proprio reparto, poi svincolato definitivamente.
        val nomi = ArrayList<String>()
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 60) {
            if (m.stato.fase == Fase.RIVELAZIONE) m.prossimo()
            else {
                m.forzaChiusura()
                m.stato.corrente?.let { nomi.add(it.nome) }
            }
        }
        assertEquals(
            listOf(
                "Attaccante Uno", "Attaccante Due", "Attaccante Uno", "Attaccante Due",
                "Centrocampista Uno", "Centrocampista Due", "Centrocampista Uno", "Centrocampista Due",
                "Portiere Uno", "Difensore Uno", "Portiere Uno", "Difensore Uno"
            ),
            nomi
        )
        assertEquals(Fase.FINE, m.stato.fase)
        assertEquals(6, m.stato.nonVenduti.size)
    }

    @Test
    fun `chiusura automatica quando tutti gli idonei hanno puntato e vincitore e il massimo`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        assertEquals(Fase.ATTESA_OFFERTE, m.stato.fase)
        m.offri(1, 10)
        assertEquals(Fase.ATTESA_OFFERTE, m.stato.fase) // non tutti hanno puntato
        m.offri(2, 0)
        m.offri(3, 25)
        (4..8).forEach { m.offri(it, 0) }
        assertEquals(Fase.RIVELAZIONE, m.stato.fase) // chiusa da sola
        val r = m.stato.rivelazione!!
        assertEquals(listOf(10, 25), r.offerteInOrdine.map { it.importo })
        assertEquals("P3", r.vincitore)
        assertEquals(25, r.importoFinale)
        assertEquals(setOf("P2", "P4", "P5", "P6", "P7", "P8"), r.passi.toSet())
        assertEquals(500 - 25, m.stato.squadre.getValue(3).budgetResiduo)
        assertEquals(1, m.stato.squadre.getValue(3).rosa.size)
        assertEquals(25, m.stato.squadre.getValue(3).rosa.first().importo)
    }

    @Test
    fun `regola del resto limita l'offerta massima`() {
        val m = MotoreAsta()
        m.avvia(config(quote = mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6)), partecipanti(), lista())
        // 25 slot vuoti, budget 500 → max = 500 − 24 = 476
        assertEquals(476, m.maxOfferta(1))
        assertTrue(m.offri(1, 477) is EsitoOfferta.Errore)
        assertTrue(m.offri(1, 476) is EsitoOfferta.Ok)
    }

    @Test
    fun `senza regola del resto il limite e il budget`() {
        val m = MotoreAsta()
        m.avvia(config(resto = false), partecipanti(), lista())
        assertEquals(500, m.maxOfferta(1))
    }

    @Test
    fun `reparto pieno esclude dalle puntate`() {
        val m = MotoreAsta()
        // quote A=1: al primo attaccante vinto, il vincitore è escluso per il secondo
        m.avvia(config(), partecipanti(), lista())
        m.offri(1, 12); (2..8).forEach { m.offri(it, 0) }
        m.prossimo() // Attaccante Due
        assertEquals(StatoBid.ESCLUSO_REPARTO, m.statoBid(1))
        assertFalse(m.idonei().any { it.id == 1 })
        assertTrue(m.offri(1, 5) is EsitoOfferta.Errore)
    }

    @Test
    fun `pareggio al massimo apre lo spareggio ristretto`() {
        val m = motoreInSpareggio()
        assertEquals(Fase.SPAREGGIO, m.stato.fase)
        assertEquals(setOf(2, 5), m.stato.candidatiSpareggio)
        // spareggio: da 21 in su (pari 20 + 1); P5 si ritira
        m.offri(2, 21); m.offri(5, 0)
        val r = m.stato.rivelazione!!
        assertEquals(Fase.RIVELAZIONE, m.stato.fase)
        assertEquals("P2", r.vincitore)
        assertEquals(21, r.importoFinale)
        assertEquals(1, r.spareggi)
        assertEquals(21, r.spareggio.first().importo)
        assertEquals(500 - 21, m.stato.squadre.getValue(2).budgetResiduo)
    }

    private fun motoreInSpareggio(): MotoreAsta {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(1, 5); m.offri(2, 20); m.offri(3, 0)
        m.offri(4, 7); m.offri(5, 20)
        (6..8).forEach { m.offri(it, 0) }
        return m
    }

    @Test
    fun `spareggio da libero con tutti ritirati diventa non venduto e reinserito una sola volta`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(1, 20); m.offri(2, 20); (3..8).forEach { m.offri(it, 0) }
        assertEquals(Fase.SPAREGGIO, m.stato.fase)
        m.offri(1, 0); m.offri(2, 0) // entrambi si ritirano
        val r = m.stato.rivelazione!!
        assertTrue(r.nonVenduto)
        assertEquals("tutti ritirati allo spareggio", r.motivoNonVenduto)
        // reinserito nel blocco attaccanti: dopo "Attaccante Due"
        m.prossimo()
        assertEquals("Attaccante Due", m.stato.corrente!!.nome)
        m.forzaChiusura(); m.prossimo() // Attancante Due non venduto → reinserito una volta
        assertEquals("Attaccante Uno", m.stato.corrente!!.nome)
        m.forzaChiusura() // Attaccante Uno è già stato reinserito una volta → ora definitivo
        assertTrue(m.stato.rivelazione!!.nonVenduto)
        m.prossimo()
        assertEquals("Attaccante Due", m.stato.corrente!!.nome) // il suo primo reinserimento
        m.forzaChiusura() // definitivo anche per lui
        m.prossimo()
        assertEquals("Centrocampista Uno", m.stato.corrente!!.nome)
    }

    @Test
    fun `forza chiusura del banditore vale passi per i mancanti`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(4, 30)
        m.forzaChiusura()
        val r = m.stato.rivelazione!!
        assertEquals("P4", r.vincitore)
        assertEquals(7, r.passi.size)
    }

    @Test
    fun `salta del banditore rende il giocatore svincolato definitivo`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.salta()
        assertTrue(m.stato.rivelazione!!.nonVenduto)
        assertEquals("saltato dal banditore", m.stato.rivelazione!!.motivoNonVenduto)
        m.prossimo()
        assertEquals("Attaccante Due", m.stato.corrente!!.nome)
    }

    @Test
    fun `annullo ultima aggiudicazione rimborsa e rimette all'asta`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(6, 40); (1..5).forEach { m.offri(it, 0) }; m.offri(7, 0); m.offri(8, 0)
        assertEquals("P6", m.stato.rivelazione!!.vincitore)
        assertEquals(460, m.stato.squadre.getValue(6).budgetResiduo)
        assertTrue(m.annullaUltimaAggiudicazione() is EsitoOfferta.Ok)
        assertEquals(500, m.stato.squadre.getValue(6).budgetResiduo)
        assertEquals(0, m.stato.squadre.getValue(6).rosa.size)
        assertEquals(Fase.ATTESA_OFFERTE, m.stato.fase)
        assertEquals("Attaccante Uno", m.stato.corrente!!.nome)
        // dopo aver proseguito, l'annullo non è più consentito
        m.offri(1, 10); (2..8).forEach { m.offri(it, 0) }
        m.prossimo()
        assertTrue(m.annullaUltimaAggiudicazione() is EsitoOfferta.Errore)
    }

    @Test
    fun `fine asta quando la coda si esaurisce`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 40) {
            if (m.stato.fase == Fase.RIVELAZIONE) m.prossimo() else m.forzaChiusura()
        }
        assertEquals(Fase.FINE, m.stato.fase)
        assertNull(m.stato.corrente)
    }

    @Test
    fun `fine asta con esaurimento coda e conteggio aggiudicazioni`() {
        val m = MotoreAsta()
        // 2 partecipanti, quote minime (4 slot a testa) ma lista di 6: si chiude per coda vuota
        m.avvia(config(), partecipanti(2), lista())
        val risultati = ArrayList<String>()
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 40) {
            when (m.stato.fase) {
                Fase.ATTESA_OFFERTE -> { m.offri(1, 5); m.offri(2, 3) }
                Fase.SPAREGGIO -> { m.offri(1, 0); m.offri(2, 0) }
                Fase.RIVELAZIONE -> { risultati.add(m.stato.rivelazione!!.vincitore ?: "svincolato"); m.prossimo() }
                Fase.FINE -> {}
            }
        }
        assertEquals(Fase.FINE, m.stato.fase)
        // P1 vince sempre dove può puntare (5 > 3); il reparto pieno lo esclude da A2 e C2
        assertEquals(4, risultati.count { it == "P1" })
        assertEquals(2, risultati.count { it == "P2" })
    }

    @Test
    fun `ordine casuale deterministico con stesso seed`() {
        val l = (1..20).map { GiocatoreLista(it, "G$it", if (it <= 10) Ruolo.A else Ruolo.P, 10) }.shuffled()
        val cfg = ConfigLega(ordineCasuale = true, seed = 42, quote = mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6))
        val m1 = MotoreAsta().apply { avvia(cfg, partecipanti(), l) }
        val m2 = MotoreAsta().apply { avvia(cfg, partecipanti(), l) }
        assertEquals(m1.stato.coda, m2.stato.coda)
        // il primo attaccante è già "corrente": nella coda restano 9 A poi i 10 P
        assertEquals(19, m1.stato.coda.size)
        assertEquals(Ruolo.A, m1.stato.corrente!!.ruolo)
        assertTrue(m1.stato.coda.take(9).all { m1.stato.listaById[it]!!.ruolo == Ruolo.A })
        assertTrue(m1.stato.coda.drop(9).all { m1.stato.listaById[it]!!.ruolo == Ruolo.P })
    }

    @Test
    fun `annuncio a voce ordine crescente senza zero`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(1, 10); m.offri(2, 0); m.offri(3, 25); m.offri(4, 0)
        m.offri(5, 3); (6..8).forEach { m.offri(it, 0) }
        val t = testoAnnuncio(m.stato.rivelazione!!)
        assertTrue(t.startsWith("Asta chiusa per Attaccante Uno."))
        val pos3 = t.indexOf("P5 ha offerto 3")
        val pos10 = t.indexOf("P1 ha offerto 10")
        val pos25 = t.indexOf("P3 ha offerto 25")
        assertTrue(pos3 in 0 until pos10 && pos10 < pos25)
        assertFalse(t.contains("P2 ha offerto"))
        assertTrue(t.endsWith("per 25 fantamilioni!"))
    }

    @Test
    fun `annuncio a voce dice solo i 4 punteggi piu alti`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(1, 2); m.offri(2, 0); m.offri(3, 44); m.offri(4, 5); m.offri(5, 0)
        m.offri(6, 12); m.offri(7, 27); m.offri(8, 9)
        val t = testoAnnuncio(m.stato.rivelazione!!)
        listOf("P8 ha offerto 9", "P6 ha offerto 12", "P7 ha offerto 27", "P3 ha offerto 44").forEach {
            assertTrue("manca nel discorso: $it", t.contains(it))
        }
        listOf("P1 ha offerto 2", "P4 ha offerto 5", "P2 ha offerto", "P5 ha offerto").forEach {
            assertFalse("non doveva essere detto: $it", t.contains(it))
        }
        assertTrue(t.indexOf("P8 ha offerto 9") < t.indexOf("P7 ha offerto 27"))
        assertTrue("chiusura sul vincitore", t.endsWith("per 44 fantamilioni!"))
    }

    @Test
    fun `annuncio con meno di 4 offerte valide dice tutte`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(3), lista())
        m.offri(1, 10); m.offri(2, 0); m.offri(3, 25)
        val t = testoAnnuncio(m.stato.rivelazione!!)
        assertTrue(t.contains("P1 ha offerto 10") && t.contains("P3 ha offerto 25"))
    }

    @Test
    fun `esportazione csv contiene rose e riepilogo`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(2), lista())
        m.offri(1, 10); m.offri(2, 5)
        m.prossimo() // Attaccante Due: P1 escluso (reparto pieno), solo P2 idoneo
        m.offri(2, 7)
        val csv = esportaCsv(m.stato)
        assertTrue(csv.contains("\"P1\";\"A\";\"Attaccante Uno\";10;490"))
        assertTrue(csv.contains("\"P2\";\"A\";\"Attaccante Due\";7;493"))
        assertTrue(csv.contains("RIEPILOGO"))
        // nessuno svincolato finora: la sezione non deve comparire
        assertFalse(csv.contains("SVINCOLATI"))
    }

    @Test
    fun `eventi registrati in ordine`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(2), lista())
        m.offri(1, 10); m.offri(2, 5)
        val tipi = m.stato.eventi.map { it::class.simpleName }
        assertEquals(listOf("Inizio", "OffertaRegistrata", "OffertaRegistrata", "Aggiudicazione"), tipi)
        assertTrue(m.stato.eventi.zipWithNext().all { (a, b) -> a.ts <= b.ts })
    }

    @Test
    fun `offerta duplicata o fuori range rifiutata`() {
        val m = MotoreAsta()
        m.avvia(config(), partecipanti(), lista())
        m.offri(1, 10)
        assertTrue(m.offri(1, 20) is EsitoOfferta.Errore) // già registrata
        assertTrue(m.offri(2, -5) is EsitoOfferta.Errore) // sotto il minimo
        assertTrue(m.offri(2, 600) is EsitoOfferta.Errore) // sopra il massimo (resto: 497)
        assertEquals(1, m.stato.offerte.size) // solo la prima è stata registrata
    }
}
