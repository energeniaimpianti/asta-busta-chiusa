package com.fantacalcio.astachiusa.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ParserTest {

    @Test
    fun `csv con header punto e virgola`() {
        val esito = ParserLista.daCsv(
            "Nome;Ruolo;Quotazione\n" +
                "Lautaro Martinez;A;45\n" +
                "Barella;C;30\n" +
                "Meret;POR;18\n"
        )
        assertTrue(esito.errori.isEmpty())
        assertEquals(3, esito.giocatori.size)
        assertEquals("Lautaro Martinez", esito.giocatori[0].nome)
        assertEquals(Ruolo.A, esito.giocatori[0].ruolo)
        assertEquals(45, esito.giocatori[0].quotazioneBase)
        assertEquals(Ruolo.P, esito.giocatori[2].ruolo)
    }

    @Test
    fun `csv con virgolette, separatore interno e BOM`() {
        val esito = ParserLista.daCsv(
            "\uFEFFNome,Ruolo,Quotazione\n\"Rossi, Mario\",Difensore,10\n\"Fabbri \"\"Il Fenomeno\"\"\",C,5\n"
        )
        assertTrue(esito.errori.isEmpty())
        assertEquals("Rossi, Mario", esito.giocatori[0].nome)
        assertEquals(Ruolo.D, esito.giocatori[0].ruolo)
        assertEquals("Fabbri \"Il Fenomeno\"", esito.giocatori[1].nome)
    }

    @Test
    fun `csv senza header usa colonne posizionali`() {
        val esito = ParserLista.daCsv("Lautaro;A;45\nBarella;C;30\n")
        assertTrue(esito.errori.isEmpty())
        assertEquals(2, esito.giocatori.size)
        assertEquals(Ruolo.A, esito.giocatori[0].ruolo)
    }

    @Test
    fun `ruoli normalizzati nelle varianti comuni`() {
        for ((testo, atteso) in listOf(
            "P" to Ruolo.P, "POR" to Ruolo.P, "Portiere" to Ruolo.P, "portieri" to Ruolo.P,
            "D" to Ruolo.D, "dif" to Ruolo.D, "Difensore" to Ruolo.D, "DEF" to Ruolo.D,
            "C" to Ruolo.C, "Centrocampista" to Ruolo.C, "MID" to Ruolo.C, "tq" to Ruolo.C,
            "A" to Ruolo.A, "ATT" to Ruolo.A, "Attaccante" to Ruolo.A, "ST" to Ruolo.A, "W" to Ruolo.A
        )) {
            assertEquals("testo \"$testo\"", atteso, Ruolo.daTesto(testo))
        }
        assertNull(Ruolo.daTesto("X"))
        assertNull(Ruolo.daTesto(""))
    }

    @Test
    fun `quotazioni sporche gestite con avvisi`() {
        val esito = ParserLista.daCsv(
            "Nome;Ruolo;Quotazione\n" +
                "Uno;A;50 FMM\n" +
                "Due;C;1.000\n" +
                "Tre;D;abc\n" +
                "Quattro;P;\n"
        )
        assertTrue(esito.errori.isEmpty())
        assertEquals(50, esito.giocatori[0].quotazioneBase)
        assertEquals(1000, esito.giocatori[1].quotazioneBase)
        assertEquals(0, esito.giocatori[2].quotazioneBase)
        assertEquals(0, esito.giocatori[3].quotazioneBase)
        assertEquals(1, esito.avvisi.size) // solo "abc" produce avviso
    }

    @Test
    fun `righe con ruolo o nome mancante diventano errori espliciti`() {
        val esito = ParserLista.daCsv("Nome;Ruolo;Quotazione\nLautaro;X;10\n;A;10\nBarella;C;20\n")
        assertEquals(1, esito.giocatori.size)
        assertEquals(2, esito.errori.size)
        assertTrue(esito.errori[0].contains("ruolo"))
        assertTrue(esito.errori[1].contains("nome"))
    }

    @Test
    fun `xlsx con header letto correttamente`() {
        val bytes = javaClass.classLoader!!.getResourceAsStream("lista_test.xlsx")!!.readBytes()
        val esito = ParserLista.daXlsx(bytes)
        assertTrue(esito.errori.isEmpty())
        assertEquals(4, esito.giocatori.size)
        assertEquals("Lautaro Martinez", esito.giocatori[0].nome)
        assertEquals(Ruolo.A, esito.giocatori[0].ruolo)
        assertEquals(45, esito.giocatori[0].quotazioneBase)
        assertEquals(Ruolo.P, esito.giocatori[1].ruolo)
        assertEquals("Giovanni Di Lorenzo", esito.giocatori[2].nome)
        assertEquals(Ruolo.D, esito.giocatori[2].ruolo)
        assertEquals(Ruolo.C, esito.giocatori[3].ruolo)
        assertEquals(28, esito.giocatori[3].quotazioneBase)
    }

    @Test
    fun `xlsx senza header in colonne posizionali`() {
        val bytes = javaClass.classLoader!!.getResourceAsStream("lista_senza_header.xlsx")!!.readBytes()
        val esito = ParserLista.daXlsx(bytes)
        assertTrue(esito.errori.isEmpty())
        assertEquals(2, esito.giocatori.size)
        assertEquals("Sommer", esito.giocatori[0].nome)
        assertEquals(Ruolo.P, esito.giocatori[0].ruolo)
        assertEquals(20, esito.giocatori[0].quotazioneBase)
        assertEquals(Ruolo.C, esito.giocatori[1].ruolo)
    }

    @Test
    fun `parseIntero copre formati reali`() {
        assertEquals(50, ParserLista.parseIntero("50"))
        assertEquals(50, ParserLista.parseIntero("50 FMM"))
        assertEquals(50, ParserLista.parseIntero("€ 50"))
        assertEquals(1000, ParserLista.parseIntero("1.000"))
        assertEquals(50, ParserLista.parseIntero("50,0"))
        assertNull(ParserLista.parseIntero(""))
        assertNull(ParserLista.parseIntero("abc"))
    }
}
