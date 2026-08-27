package com.fantacalcio.astachiusa.speech

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Annunciatore vocale (TTS italiano). Degrada in modo controllato se il motore
 * o la voce italiana non sono disponibili: la rivelazione resta visiva.
 */
class Annunciatore(context: Context) {

    private var tts: TextToSpeech? = null
    var pronto = false
        private set
    var linguaItaliana = false
        private set

    init {
        tts = TextToSpeech(context.applicationContext) { stato ->
            pronto = stato == TextToSpeech.SUCCESS
            if (pronto) {
                val esito = tts?.setLanguage(Locale.ITALY)
                linguaItaliana = esito != TextToSpeech.LANG_MISSING_DATA && esito != TextToSpeech.LANG_NOT_SUPPORTED
            }
        }
    }

    fun parla(testo: String) {
        val t = tts ?: return
        if (!pronto) return
        if (!linguaItaliana) {
            // anche senza voce IT proviamo comunque: molte volte il fallback legge comunque cifre e nomi
            t.setLanguage(Locale.ITALY)
        }
        t.speak(testo, TextToSpeech.QUEUE_FLUSH, null, "annuncio_asta")
    }

    fun silenzia() {
        tts?.stop()
    }

    fun chiudi() {
        tts?.shutdown()
        tts = null
    }
}
