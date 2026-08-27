package com.fantacalcio.astachiusa.core

import java.io.File

fun main() {
    val bytes = File("""V:\Progetti GLM\App Fantacalcio\AstaWeb\liste\lista-seriea-2026-27.xlsx""").readBytes()
    val esito = ParserLista.daXlsx(bytes)
    require(esito.errori.isEmpty()) { "errori: ${esito.errori}" }
    require(esito.avvisi.isEmpty()) { "avvisi: ${esito.avvisi}" }
    require(esito.giocatori.size == 228) { "totale ${esito.giocatori.size}" }
    val attesi = mapOf(Ruolo.P to 28, Ruolo.D to 72, Ruolo.C to 72, Ruolo.A to 56)
    for ((r, n) in attesi) require(esito.giocatori.count { it.ruolo == r } == n) { "ruolo $r" }
    val perNome = esito.giocatori.associateBy { it.nome }
    require(perNome.getValue("Martinez L.").quotazioneBase == 35)
    require(perNome.getValue("Malen").quotazioneBase == 34)
    require(perNome.getValue("Dimarco").quotazioneBase == 32)
    require(perNome.getValue("Svilar").ruolo == Ruolo.P)
    require(perNome.getValue("Martinez L.").ruolo == Ruolo.A)
    // nomi con caratteri speciali transitano intatti (escape unicode: indipendenti dall'encoding del sorgente)
    val speciali = listOf("Dod\u00f2", "Lucum\u00ec", "Kon\u00e8 M.", "Bernab\u00e8", "Cal\u00f2", "Laurient\u00e8", "Soul\u00e8")
    for (n in speciali) require(perNome.containsKey(n)) { "manca: " + n }
    // il file CSV gemello
    val esitoCsv = ParserLista.daCsv(File("""V:\Progetti GLM\App Fantacalcio\AstaWeb\liste\lista-seriea-2026-27.csv""").readText(Charsets.UTF_8))
    require(esitoCsv.errori.isEmpty() && esitoCsv.giocatori.size == 228) { "csv: ${esitoCsv.giocatori.size}" }
    println("KOTLIN OK: 228 giocatori (28 P / 72 D / 72 C / 56 A), valori, nomi accentati e CSV corretti")
}
