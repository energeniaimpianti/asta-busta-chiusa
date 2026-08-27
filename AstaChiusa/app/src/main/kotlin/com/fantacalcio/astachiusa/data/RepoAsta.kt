package com.fantacalcio.astachiusa.data

import android.content.Context
import com.fantacalcio.astachiusa.core.StatoAsta
import org.json.JSONObject
import java.io.File

/**
 * Persistenza su disco: snapshot JSON dello stato dopo ogni mossa + log eventi
 * append-only (JSONL) per audit, in filesDir/asta_chiusa.
 * La serializzazione vive in [SerializzatoreStato] (puro, testato su JVM host):
 * qui solo file I/O.
 */
class RepoAsta(context: Context) {

    private val dir: File = File(context.filesDir, "asta_chiusa").apply { mkdirs() }
    private val fileStato = File(dir, "stato.json")
    private val fileEventi = File(dir, "eventi.jsonl")
    private var eventiPersistiti = 0

    val esisteSessione: Boolean get() = fileStato.exists()

    fun salva(stato: StatoAsta) {
        val nuovi = stato.eventi.drop(eventiPersistiti)
        if (nuovi.isNotEmpty()) {
            fileEventi.appendText(nuovi.joinToString("") { SerializzatoreStato.eventoJson(it).toString() + "\n" })
            eventiPersistiti = stato.eventi.size
        }
        fileStato.writeText(SerializzatoreStato.statoJson(stato).toString())
    }

    fun azzera() {
        fileStato.delete()
        fileEventi.delete()
        eventiPersistiti = 0
    }

    fun carica(): StatoAsta? {
        if (!fileStato.exists()) return null
        return try {
            // gli eventi restano solo nel log su disco: in memoria non servono alla ripresa
            SerializzatoreStato.statoDaJson(JSONObject(fileStato.readText()))
        } catch (e: Exception) {
            null
        }
    }

    fun leggiEventi(): List<JSONObject> =
        if (fileEventi.exists()) fileEventi.readLines().filter { it.isNotBlank() }.map { JSONObject(it) }
        else emptyList()
}
