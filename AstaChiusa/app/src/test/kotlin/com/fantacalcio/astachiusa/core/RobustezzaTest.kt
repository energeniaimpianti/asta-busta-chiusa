package com.fantacalcio.astachiusa.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.util.zip.ZipException
import kotlin.random.Random

/**
 * Prove di robustezza: fuzz di aste complete con invarianti verificati a OGNI passo,
 * determinismo del replay, fuzz parser, xlsx corrotti, stress prestazionale.
 */
class RobustezzaTest {

    // --------------------------------------------------------------- invarianti

    private fun verificaInvarianti(m: MotoreAsta) {
        val s = m.stato
        val cfg = s.config
        for (sq in s.squadre.values) {
            assertTrue("budget negativo per ${sq.nome}", sq.budgetResiduo >= 0)
            assertTrue("budget sopra il massimo per ${sq.nome}", sq.budgetResiduo <= cfg.budgetIniziale)
            for ((r, q) in cfg.quote) {
                assertTrue(
                    "${sq.nome}: reparto $r oltre quota (${sq.countRuolo(r, cfg.quote)} > $q)",
                    sq.countRuolo(r, cfg.quote) <= q
                )
            }
            assertTrue("${sq.nome}: rosa oltre il totale slot", sq.rosa.size <= cfg.totaleSlot)
            assertTrue("importo non positivo in rosa di ${sq.nome}", sq.rosa.all { it.importo >= 1 })
        }
        val venduti = s.squadre.values.flatMap { sq -> sq.rosa.map { it.giocatore.id } }
        assertEquals("giocatore venduto a due squadre", venduti.size, venduti.toSet().size)
        assertTrue(
            "giocatore sia venduto che svincolato definitivo",
            venduti.toSet().intersect(s.nonVenduti.toSet()).isEmpty()
        )
        assertEquals("duplicati in coda", s.coda.size, s.coda.toSet().size)
        // durante RIVELAZIONE il corrente può legittimamente essere già stato reinserito in coda
        if (s.fase == Fase.ATTESA_OFFERTE || s.fase == Fase.SPAREGGIO) {
            s.corrente?.let { assertFalse("corrente anche in coda", s.coda.contains(it.id)) }
        }
        val speso = s.squadre.values.sumOf { sq -> sq.rosa.sumOf { it.importo } }
        assertEquals(
            "conservazione del denaro violata",
            cfg.budgetIniziale.toLong() * s.partecipanti.size,
            (s.squadre.values.sumOf { it.budgetResiduo } + speso).toLong()
        )
        assertTrue("timestamp eventi non monotoni", s.eventi.zipWithNext().all { (a, b) -> a.ts <= b.ts })
    }

    private fun verificaFinale(m: MotoreAsta) {
        assertEquals("asta non terminata", Fase.FINE, m.stato.fase)
        assertTrue(
            "fine non giustificata (coda non vuota e squadre incomplete)",
            m.stato.coda.isEmpty() || m.stato.tuttiCompleti
        )
        verificaInvarianti(m)
    }

    // ------------------------------------------------------------------- fuzz

    private fun astaCasuale(seme: Int): MotoreAsta {
        val rnd = Random(seme.toLong() * 7919 + 13)
        val nPart = 2 + rnd.nextInt(10) // 2..11
        val quote = mapOf(
            Ruolo.P to 1 + rnd.nextInt(3), Ruolo.D to 1 + rnd.nextInt(8),
            Ruolo.C to 1 + rnd.nextInt(8), Ruolo.A to 1 + rnd.nextInt(6)
        )
        val config = ConfigLega(
            budgetIniziale = 100 + rnd.nextInt(900),
            quote = quote,
            ordineRuoli = Ruolo.entries.shuffled(rnd),
            regolaResto = rnd.nextBoolean(),
            baseComeMinimo = rnd.nextBoolean(),
            spareggioDaPari = rnd.nextBoolean(),
            ordineCasuale = rnd.nextBoolean(),
            seed = seme.toLong()
        )
        val lista = (0 until quote.values.sum() * nPart + rnd.nextInt(24)).map {
            GiocatoreLista(it, "G$it", Ruolo.entries[rnd.nextInt(4)], 5 + rnd.nextInt(90))
        }
        val m = MotoreAsta()
        m.avvia(config, (1..nPart).map { Partecipante(it, "P$it") }, lista)
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 50_000) {
            when (m.stato.fase) {
                Fase.ATTESA_OFFERTE, Fase.SPAREGGIO -> {
                    val p = m.interrogabili().randomOrNull(rnd)
                    when {
                        p == null || rnd.nextInt(12) == 0 -> m.forzaChiusura()
                        rnd.nextInt(60) == 0 && m.stato.fase != Fase.SPAREGGIO -> m.salta()
                        else -> {
                            val max = m.maxOfferta(p.id)
                            val offerta = when (rnd.nextInt(10)) {
                                0 -> 0                        // passo/ritiro
                                1 -> -rnd.nextInt(10)          // invalido voluto
                                2 -> max + 1 + rnd.nextInt(50) // sopra il massimo voluto
                                3 -> Int.MAX_VALUE             // estremo
                                else -> 1 + rnd.nextInt(maxOf(1, max)) // valido 1..max
                            }
                            m.offri(p.id, offerta) // anche gli errori controllati vanno ignorati senza rompere lo stato
                        }
                    }
                }
                Fase.RIVELAZIONE -> if (rnd.nextInt(25) == 0) m.annullaUltimaAggiudicazione() else m.prossimo()
                Fase.FINE -> {}
            }
            verificaInvarianti(m)
        }
        if (guardia >= 50_000) fail("asta con seme $seme non termina (guardia scattata)")
        verificaFinale(m)
        return m
    }

    @Test
    fun `fuzz 400 aste complete con invarianti a ogni passo`() {
        for (seme in 0 until 400) astaCasuale(seme)
    }

    @Test
    fun `determinismo replay stesso seme stessi eventi`() {
        // due run indipendenti dello stesso scenario devono produrre eventi identici (a parte i ts)
        val m1 = astaCasuale(7)
        val m2 = astaCasuale(7)
        assertEquals(m1.stato.eventi.map(::senzaTs), m2.stato.eventi.map(::senzaTs))
        assertEquals(m1.stato.coda, m2.stato.coda)
        assertEquals(
            m1.stato.squadre.mapValues { it.value.rosa.map { a -> a.giocatore.id to a.importo } },
            m2.stato.squadre.mapValues { it.value.rosa.map { a -> a.giocatore.id to a.importo } }
        )
    }

    private fun senzaTs(e: EventoAsta): EventoAsta = when (e) {
        is EventoAsta.Inizio -> e.copy(ts = 0)
        is EventoAsta.OffertaRegistrata -> e.copy(ts = 0)
        is EventoAsta.ChiusuraForzata -> e.copy(ts = 0)
        is EventoAsta.Aggiudicazione -> e.copy(ts = 0)
        is EventoAsta.NonVenduto -> e.copy(ts = 0)
        is EventoAsta.SaltaGiocatore -> e.copy(ts = 0)
        is EventoAsta.AnnullamentoAggiudicazione -> e.copy(ts = 0)
        is EventoAsta.TermineAnticipato -> e.copy(ts = 0)
    }

    // -------------------------------------------------------- scenario realistico

    @Test
    fun `asta realistica 8 partecipanti con offerte casuali termina con invarianti`() {
        val rnd = Random(2026)
        val quote = mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6)
        // lista con sovrappiù per ruolo: la completamento non è garantito con offerte casuali
        val lista = sequence {
            var id = 0
            for ((r, q) in quote) repeat(q * 8 + 12) { yield(GiocatoreLista(id++, "G$id-$r", r, 5 + rnd.nextInt(60))) }
        }.toList().shuffled(rnd)
        val m = MotoreAsta()
        m.avvia(ConfigLega(budgetIniziale = 500, quote = quote), (1..8).map { Partecipante(it, "P$it") }, lista)
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 60_000) {
            when (m.stato.fase) {
                Fase.ATTESA_OFFERTE, Fase.SPAREGGIO -> {
                    val p = m.interrogabili().randomOrNull(rnd) ?: run { m.forzaChiusura(); null }
                    if (p != null) {
                        val max = m.maxOfferta(p.id)
                        m.offri(p.id, if (rnd.nextInt(4) == 0) 0 else 1 + rnd.nextInt(maxOf(1, max)))
                    }
                }
                Fase.RIVELAZIONE -> m.prossimo()
                Fase.FINE -> {}
            }
        }
        verificaFinale(m)
        for (sq in m.stato.squadre.values) {
            assertTrue("rosa oltre 25: ${sq.rosa.size}", sq.rosa.size <= 25)
            assertTrue("spesa oltre budget", sq.rosa.sumOf { it.importo } <= 500)
        }
        // gli svincolati definitivi non compaiono in nessuna rosa
        val venduti = m.stato.squadre.values.flatMap { it.rosa.map { a -> a.giocatore.id } }.toSet()
        assertTrue(venduti.intersect(m.stato.nonVenduti.toSet()).isEmpty())
    }

    @Test
    fun `asta deterministica completa tutte le rose da 25`() {
        val quote = mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6)
        // lista esattamente proporzionale (24 P, 64 D, 64 C, 48 A): nessuno svincolato è ammesso
        val lista = sequence {
            var id = 0
            for ((r, q) in quote) repeat(q * 8) { yield(GiocatoreLista(id++, "G$id-$r", r, 10)) }
        }.toList()
        val m = MotoreAsta()
        m.avvia(
            ConfigLega(budgetIniziale = 500, quote = quote),
            (1..8).map { Partecipante(it, "P$it") }, lista
        )
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 60_000) {
            when (m.stato.fase) {
                Fase.ATTESA_OFFERTE, Fase.SPAREGGIO -> {
                    // strategia deterministica: il primo idoneo punta 1, tutti gli altri passano
                    val ps = m.interrogabili()
                    ps.firstOrNull()?.let { m.offri(it.id, 1) }
                    ps.drop(1).forEach { m.offri(it.id, 0) }
                }
                Fase.RIVELAZIONE -> m.prossimo()
                Fase.FINE -> {}
            }
        }
        verificaFinale(m)
        assertTrue("squadre non complete", m.stato.tuttiCompleti)
        assertEquals("giocatori rimasti svincolati", 0, m.stato.nonVenduti.size)
        for (sq in m.stato.squadre.values) {
            assertEquals(25, sq.rosa.size)
            assertEquals(3, sq.countRuolo(Ruolo.P, quote))
            assertEquals(8, sq.countRuolo(Ruolo.D, quote))
            assertEquals(8, sq.countRuolo(Ruolo.C, quote))
            assertEquals(6, sq.countRuolo(Ruolo.A, quote))
            assertEquals(475, sq.budgetResiduo) // 25 acquisti da 1 FMM ciascuno
        }
    }

    // --------------------------------------------------------------- parser fuzz

    private val alfabeto = "abcdePAOW;,\"\t .-€0123456789\n".toList()

    @Test
    fun `fuzz csv con dati spazzatura mai eccezioni`() {
        val rnd = Random(99)
        repeat(400) {
            val testo = (0 until rnd.nextInt(8)).map {
                (0 until rnd.nextInt(10)).joinToString("") { alfabeto[rnd.nextInt(alfabeto.size)].toString() }
            }.joinToString("\n")
            try {
                ParserLista.daCsv(testo)
            } catch (e: Exception) {
                fail("eccezione con input: \"$testo\" → ${e::class.simpleName}: ${e.message}")
            }
        }
    }

    @Test
    fun `csv vuoto o solo spazi gestito senza errori gravi`() {
        assertTrue(ParserLista.daCsv("").errori.isNotEmpty())
        assertTrue(ParserLista.daCsv("\n\n\n").errori.isNotEmpty() || ParserLista.daCsv("\n\n\n").giocatori.isEmpty())
        assertTrue(ParserLista.daCsv("Nome;Ruolo\n").giocatori.isEmpty())
    }

    @Test
    fun `xlsx corrotto o troncato non blocca mai`() {
        val bytes = javaClass.classLoader!!.getResourceAsStream("lista_test.xlsx")!!.readBytes()
        val rnd = Random(7)
        repeat(60) {
            val copia = bytes.copyOf()
            when (rnd.nextInt(3)) {
                0 -> for (i in 0 until rnd.nextInt(30)) copia[rnd.nextInt(copia.size)] = rnd.nextInt(256).toByte()
                1 -> copia.fill(0, copia.size / 2, copia.size) // troncamento simulato
                else -> repeat(rnd.nextInt(10)) { copia[rnd.nextInt(copia.size)] = 0 }
            }
            try {
                ParserLista.daXlsx(copia) // o esce un esito, o un'eccezione di zip/xml: mai un hang
            } catch (e: ZipException) {
                // atteso
            } catch (e: Exception) {
                // qualunque altra eccezione di parsing è accettabile, purché non Error/hang
                if (e is Error) throw e
            }
        }
    }

    // ------------------------------------------------------------- performance

    @Test
    fun `stress 12 partecipanti x 500 giocatori completa sotto 20 secondi`() {
        val rnd = Random(1)
        val quote = mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6)
        val lista = (0 until 500).map { GiocatoreLista(it, "G$it", Ruolo.entries[it % 4], 10) }
        val m = MotoreAsta()
        m.avvia(ConfigLega(budgetIniziale = 800, quote = quote), (1..12).map { Partecipante(it, "P$it") }, lista)
        val inizio = System.nanoTime()
        var guardia = 0
        while (m.stato.fase != Fase.FINE && guardia++ < 200_000) {
            when (m.stato.fase) {
                Fase.ATTESA_OFFERTE, Fase.SPAREGGIO -> {
                    val p = m.interrogabili().randomOrNull(rnd)
                    if (p == null) m.forzaChiusura()
                    else m.offri(p.id, if (rnd.nextInt(3) == 0) 0 else 1 + rnd.nextInt(m.maxOfferta(p.id) + 1))
                }
                Fase.RIVELAZIONE -> m.prossimo()
                Fase.FINE -> {}
            }
        }
        val ms = (System.nanoTime() - inizio) / 1_000_000
        assertEquals(Fase.FINE, m.stato.fase)
        assertTrue("troppo lento: ${ms}ms", ms < 20_000)
        verificaInvarianti(m)
    }
}
