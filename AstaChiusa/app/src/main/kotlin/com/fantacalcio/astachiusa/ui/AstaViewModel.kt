package com.fantacalcio.astachiusa.ui

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.fantacalcio.astachiusa.R
import com.fantacalcio.astachiusa.core.*
import com.fantacalcio.astachiusa.data.RepoAsta
import com.fantacalcio.astachiusa.speech.Annunciatore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File

enum class Schermata { HOME, SETUP, LISTA, ASTA, SQUADRE, FINE }

/**
 * Stato UI + colla tra motore (puro), persistenza e voce.
 */
class AstaViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = RepoAsta(app)
    val annunciatore = Annunciatore(app)
    private val motore = MotoreAsta()

    // ---------------------------------------------------------------- setup
    var nomeLega by mutableStateOf("Lega dell'Asta")
    var nomi by mutableStateOf(List(8) { "" })
    var budget by mutableStateOf(500)
    var quote by mutableStateOf(mapOf(Ruolo.P to 3, Ruolo.D to 8, Ruolo.C to 8, Ruolo.A to 6))
    var ordineRuoli by mutableStateOf(listOf(Ruolo.A, Ruolo.C, Ruolo.P, Ruolo.D))
    var regolaResto by mutableStateOf(true)
    var baseComeMinimo by mutableStateOf(false)
    var ordineCasuale by mutableStateOf(false)
    var spareggioDaPari by mutableStateOf(true)

    // ---------------------------------------------------------------- lista
    var esitoLista by mutableStateOf<ParserLista.EsitoLista?>(null)
    var erroreImport by mutableStateOf<String?>(null)
    var nomeFileLista by mutableStateOf<String?>(null)

    // ---------------------------------------------------------------- runtime
    var schermata by mutableStateOf(Schermata.HOME)
    var stato by mutableStateOf<StatoAsta?>(null)
    var messaggio by mutableStateOf<String?>(null)
    val sessioneSalvata: Boolean get() = repo.esisteSessione
    private var ultimoRoundAnnunciato = -1

    override fun onCleared() {
        annunciatore.chiudi()
        super.onCleared()
    }

    // ------------------------------------------------------------------ navigazione

    fun vaiA(s: Schermata) {
        schermata = s
    }

    // ------------------------------------------------------------------ lista

    fun leggiFile(uri: Uri?) {
        if (uri == null) return
        erroreImport = null
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val bytes = getApplication<Application>().contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("File illeggibile")
                nomeFileLista = uri.lastPathSegment ?: "lista"
                val esito = if (bytes.size > 1 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()) {
                    ParserLista.daXlsx(bytes)
                } else {
                    ParserLista.daCsv(String(bytes, Charsets.UTF_8))
                }
                esitoLista = esito
                if (esito.errori.isNotEmpty())
                    erroreImport = "${esito.errori.size} righe scartate (vedi dettagli)"
            } catch (e: Exception) {
                erroreImport = "Impossibile leggere il file: ${e.message}"
            }
        }
    }

    fun caricaDemo() {
        erroreImport = null
        nomeFileLista = "lista_demo.csv (interna)"
        val testo = getApplication<Application>().resources.openRawResource(R.raw.lista_demo).use { it.readBytes() }.decodeToString()
        esitoLista = ParserLista.daCsv(testo)
    }

    // ------------------------------------------------------------------ avvio

    fun avviaAsta() {
        val lista = esitoLista?.giocatori ?: return
        if (lista.isEmpty()) {
            messaggio = "Carica prima una lista di giocatori"
            return
        }
        val partecipanti = nomi.mapIndexed { i, n ->
            Partecipante(i + 1, n.trim().ifEmpty { "Partecipante ${i + 1}" })
        }
        repo.azzera()
        val config = ConfigLega(
            nomeLega = nomeLega.trim().ifEmpty { "Lega" },
            budgetIniziale = budget,
            quote = quote,
            ordineRuoli = ordineRuoli,
            regolaResto = regolaResto,
            baseComeMinimo = baseComeMinimo,
            ordineCasuale = ordineCasuale,
            seed = System.currentTimeMillis(),
            spareggioDaPari = spareggioDaPari
        )
        motore.avvia(config, partecipanti, lista)
        ultimoRoundAnnunciato = -1
        stato = motore.stato
        repo.salva(motore.stato)
        schermata = Schermata.ASTA
    }

    fun riprendi() {
        val s = repo.carica()
        if (s == null) {
            messaggio = "Nessuna sessione da riprendere"
            return
        }
        motore.ripristina(s)
        stato = s
        schermata = when (s.fase) {
            Fase.FINE -> Schermata.FINE
            else -> Schermata.ASTA
        }
    }

    fun nuovaAsta() {
        repo.azzera()
        motore.reset()
        stato = null
        esitoLista = null
        nomeFileLista = null
        ultimoRoundAnnunciato = -1
        schermata = Schermata.SETUP
    }

    // ------------------------------------------------------------------ mosse

    fun offri(idPartecipante: Int, importo: Int) {
        val esito = motore.offri(idPartecipante, importo)
        if (esito is EsitoOfferta.Errore) messaggio = esito.motivo else dopoMossa()
    }

    fun forzaChiusura() {
        val esito = motore.forzaChiusura()
        if (esito is EsitoOfferta.Errore) messaggio = esito.motivo else dopoMossa()
    }

    fun salta() {
        val esito = motore.salta()
        if (esito is EsitoOfferta.Errore) messaggio = esito.motivo else dopoMossa()
    }

    fun prossimo() {
        try {
            motore.prossimo()
            dopoMossa()
        } catch (e: IllegalStateException) {
            messaggio = e.message
        }
    }

    fun annullaUltima() {
        val esito = motore.annullaUltimaAggiudicazione()
        if (esito is EsitoOfferta.Errore) messaggio = esito.motivo else {
            annunciatore.silenzia()
            ultimoRoundAnnunciato = motore.stato.roundId
            dopoMossa()
        }
    }

    fun termina() {
        motore.termina()
        dopoMossa()
    }

    private fun dopoMossa() {
        repo.salva(motore.stato)
        stato = motore.stato
        val s = motore.stato
        if (s.fase == Fase.RIVELAZIONE && s.rivelazione != null && ultimoRoundAnnunciato != s.roundId) {
            ultimoRoundAnnunciato = s.roundId
            annunciatore.parla(testoAnnuncio(s.rivelazione!!))
        }
        if (s.fase == Fase.FINE) schermata = Schermata.FINE
    }

    fun ripetiAnnuncio() {
        stato?.rivelazione?.let { annunciatore.parla(testoAnnuncio(it)) }
    }

    // ------------------------------------------------------------------ helper UI

    fun maxOfferta(id: Int): Int = motore.maxOfferta(id)
    fun minOfferta(): Int = motore.minOffertaCorrente()
    fun statoBid(id: Int): StatoBid = motore.statoBid(id)
    fun statistiche(): Map<Ruolo, StatRuolo> = motore.statistiche()

    fun pariSpareggio(): Int = stato?.let { s ->
        val base = if (s.spareggi > 0) s.offerteRoundPrincipale else s.offerte
        base.values.maxOrNull() ?: 0
    } ?: 0

    fun minSpareggio(): Int {
        val s = stato ?: return 1
        return if (s.config.spareggioDaPari) pariSpareggio() + 1 else 1
    }

    fun csvTesto(): String = stato?.let { esportaCsv(it) } ?: ""

    fun fileCsv(): File {
        val f = File(getApplication<Application>().cacheDir, "asta_squadre.csv")
        f.writeText(csvTesto(), Charsets.UTF_8)
        return f
    }

    fun consumaMessaggio() {
        messaggio = null
    }
}
