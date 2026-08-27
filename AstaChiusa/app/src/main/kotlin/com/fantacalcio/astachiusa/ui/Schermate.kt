package com.fantacalcio.astachiusa.ui

import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import com.fantacalcio.astachiusa.core.Fase
import com.fantacalcio.astachiusa.core.Ruolo
import com.fantacalcio.astachiusa.core.StatoBid
import com.fantacalcio.astachiusa.core.StatoAsta
import kotlinx.coroutines.delay

private val coloreRuolo = mapOf(
    Ruolo.P to Color(0xFFF9A825),
    Ruolo.D to Color(0xFF1565C0),
    Ruolo.C to Color(0xFF2E7D32),
    Ruolo.A to Color(0xFFC62828)
)

@Composable
fun AppAsta(vm: AstaViewModel) {
    val ctx = LocalContext.current
    LaunchedEffect(vm.messaggio) {
        vm.messaggio?.let {
            Toast.makeText(ctx, it, Toast.LENGTH_LONG).show()
            vm.consumaMessaggio()
        }
    }
    BackHandler(enabled = vm.schermata == Schermata.SQUADRE) { vm.vaiA(Schermata.ASTA) }
    Surface(Modifier.fillMaxSize()) {
        when (vm.schermata) {
            Schermata.HOME -> SchermataHome(vm)
            Schermata.SETUP -> SchermataSetup(vm)
            Schermata.LISTA -> SchermataLista(vm)
            Schermata.ASTA -> SchermataAsta(vm)
            Schermata.SQUADRE -> SchermataSquadre(vm)
            Schermata.FINE -> SchermataFine(vm)
        }
    }
}

// ------------------------------------------------------------------ HOME

@Composable
fun SchermataHome(vm: AstaViewModel) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("⚽", fontSize = 64.sp)
        Text("Asta Busta Chiusa", fontSize = 32.sp, fontWeight = FontWeight.Bold)
        Text("8 partecipanti + 1 banditore", style = MaterialTheme.typography.bodyLarge)
        Text(
            "Offerte segrete · rivelazione a voce dal più basso al vincitore",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = { vm.schermata = Schermata.SETUP }, modifier = Modifier.fillMaxWidth()) {
            Text("▶ Nuova asta")
        }
        if (vm.sessioneSalvata) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = { vm.riprendi() }, modifier = Modifier.fillMaxWidth()) {
                Text("↩ Riprendi l'ultima sessione")
            }
        }
        Spacer(Modifier.height(48.dp))
        Text(
            "Le squadre vengono salvate automaticamente dopo ogni aggiudicazione.",
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

// ------------------------------------------------------------------ SETUP

@Composable
fun SchermataSetup(vm: AstaViewModel) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp)
    ) {
        Text("Setup della lega", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = vm.nomeLega,
            onValueChange = { vm.nomeLega = it },
            label = { Text("Nome della lega") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        Spacer(Modifier.height(16.dp))
        Text("Partecipanti (${vm.nomi.size})", fontWeight = FontWeight.SemiBold)
        vm.nomi.forEachIndexed { i, nome ->
            OutlinedTextField(
                value = nome,
                onValueChange = { vm.nomi = vm.nomi.toMutableList().also { l -> l[i] = it } },
                label = { Text("Partecipante ${i + 1}") },
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                singleLine = true
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(
                onClick = { if (vm.nomi.size > 2) vm.nomi = vm.nomi.dropLast(1) },
                enabled = vm.nomi.size > 2
            ) { Text("− Rimuovi") }
            TextButton(
                onClick = { if (vm.nomi.size < 12) vm.nomi = vm.nomi + "" },
                enabled = vm.nomi.size < 12
            ) { Text("+ Aggiungi") }
        }
        Spacer(Modifier.height(16.dp))
        Text("Budget iniziale: ${vm.budget} FMM", fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (vm.budget > 50) vm.budget -= 10 }) { Text("−", fontSize = 22.sp) }
            Text("${vm.budget}", fontSize = 22.sp, modifier = Modifier.padding(horizontal = 16.dp))
            IconButton(onClick = { if (vm.budget < 3000) vm.budget += 10 }) { Text("+", fontSize = 22.sp) }
        }
        Spacer(Modifier.height(16.dp))
        Text("Reparti della rosa (quote)", fontWeight = FontWeight.SemiBold)
        Ruolo.entries.forEach { r ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier.size(14.dp).background(coloreRuolo.getValue(r), CircleShape)
                ) {}
                Text("  ${r.etichetta}", Modifier.weight(1f))
                IconButton(onClick = { if ((vm.quote[r] ?: 0) > 0) vm.quote = vm.quote + (r to (vm.quote[r]!! - 1)) }) {
                    Text("−", fontSize = 20.sp)
                }
                Text("${vm.quote[r] ?: 0}", fontSize = 18.sp)
                IconButton(onClick = { if ((vm.quote[r] ?: 0) < 15) vm.quote = vm.quote + (r to (vm.quote[r]!! + 1)) }) {
                    Text("+", fontSize = 20.sp)
                }
            }
        }
        Text(
            "Rosa totale: ${vm.quote.values.sum()} giocatori",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(16.dp))
        Text("Ordine d'asta dei reparti", fontWeight = FontWeight.SemiBold)
        vm.ordineRuoli.forEachIndexed { i, r ->
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}.", Modifier.width(28.dp))
                Box(Modifier.size(14.dp).background(coloreRuolo.getValue(r), CircleShape)) {}
                Text("  ${r.etichetta}", Modifier.weight(1f))
                IconButton(
                    onClick = {
                        if (i > 0) vm.ordineRuoli = vm.ordineRuoli.toMutableList().apply {
                            add(i - 1, removeAt(i))
                        }
                    },
                    enabled = i > 0
                ) { Text("↑", fontSize = 18.sp) }
                IconButton(
                    onClick = {
                        if (i < vm.ordineRuoli.size - 1) vm.ordineRuoli = vm.ordineRuoli.toMutableList().apply {
                            add(i + 1, removeAt(i))
                        }
                    },
                    enabled = i < vm.ordineRuoli.size - 1
                ) { Text("↓", fontSize = 18.sp) }
            }
        }
        Spacer(Modifier.height(16.dp))
        Interruttore(vm.regolaResto, { vm.regolaResto = it }, "Regola del resto", "max = budget − (slot vuoti − 1): resta almeno 1 FMM per posto")
        Interruttore(vm.spareggioDaPari, { vm.spareggioDaPari = it }, "Spareggio da pari + 1", "al pareggio si rilancia a partire dall'offerta di parità + 1")
        Interruttore(vm.baseComeMinimo, { vm.baseComeMinimo = it }, "Quotazione base = offerta minima", "il prezzo base del file diventa il minimo per puntare")
        Interruttore(vm.ordineCasuale, { vm.ordineCasuale = it }, "Ordine casuale nel reparto", "mescola i giocatori dentro ogni reparto")
        Spacer(Modifier.height(24.dp))
        val valida = vm.nomi.size >= 2 && vm.quote.values.sum() >= 2 && vm.budget >= vm.quote.values.sum()
        Button(
            onClick = {
                if (valida) vm.schermata = Schermata.LISTA
                else vm.messaggio = "Sistemare budget (≥ slot totali) e partecipanti (≥ 2)"
            },
            Modifier.fillMaxWidth()
        ) { Text("Avanti → carica la lista") }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = { vm.schermata = Schermata.HOME }) { Text("← Home") }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun Interruttore(valore: Boolean, cambia: (Boolean) -> Unit, titolo: String, sotto: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(titolo, fontWeight = FontWeight.Medium)
            Text(sotto, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = valore, onCheckedChange = cambia)
    }
}

// ------------------------------------------------------------------ LISTA

@Composable
fun SchermataLista(vm: AstaViewModel) {
    val selettore = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        vm.leggiFile(uri)
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(16.dp)) {
        Text("1 · Lista giocatori", fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text(
            "Excel o CSV con colonne Nome · Ruolo · Quotazione (la quotazione resta nascosta ai partecipanti)",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(12.dp))
        Button(onClick = { selettore.launch(arrayOf("*/*")) }, modifier = Modifier.fillMaxWidth()) {
            Text("📂 Importa .xlsx / .csv")
        }
        TextButton(onClick = { vm.caricaDemo() }, modifier = Modifier.fillMaxWidth()) {
            Text("🧪 Prova con la lista demo interna")
        }
        vm.erroreImport?.let {
            Text(it, color = Color(0xFFC62828), style = MaterialTheme.typography.bodySmall)
        }
        vm.esitoLista?.let { esito ->
            Spacer(Modifier.height(12.dp))
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(vm.nomeFileLista ?: "Lista", fontWeight = FontWeight.SemiBold)
                    Text("${esito.giocatori.size} giocatori validi · ${esito.righeLette} righe lette")
                    Spacer(Modifier.height(6.dp))
                    Row {
                        Ruolo.entries.forEach { r ->
                            val n = esito.giocatori.count { it.ruolo == r }
                            Text(
                                "${r.codice} $n   ",
                                color = coloreRuolo.getValue(r),
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    if (esito.avvisi.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text("Avvisi:", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                        esito.avvisi.take(6).forEach {
                            Text("• $it", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    if (esito.errori.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Righe scartate (${esito.errori.size}):",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFC62828)
                        )
                        esito.errori.take(8).forEach {
                            Text("• $it", style = MaterialTheme.typography.bodySmall, color = Color(0xFFC62828))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        val esito = vm.esitoLista
        val pronto = esito != null && esito.giocatori.size >= 2 && esito.errori.isEmpty()
        Button(
            onClick = { vm.avviaAsta() },
            enabled = pronto,
            modifier = Modifier.fillMaxWidth()
        ) { Text("🏁 Avvia l'asta") }
        TextButton(onClick = { vm.schermata = Schermata.SETUP }, modifier = Modifier.fillMaxWidth()) {
            Text("← Torna al setup")
        }
    }
}

// ------------------------------------------------------------------ ASTA

@Composable
fun SchermataAsta(vm: AstaViewModel) {
    val s = vm.stato ?: return
    var bustaPer by remember { mutableStateOf<Int?>(null) }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(s.config.nomeLega, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("In coda: ${s.coda.size}", style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(6.dp))
        Row {
            vm.statistiche().forEach { (r, st) ->
                Card(Modifier.padding(end = 6.dp)) {
                    Text(
                        "${r.codice} ${st.venduti}/${st.totale}",
                        Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        color = coloreRuolo.getValue(r),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        if (s.fase == Fase.RIVELAZIONE && s.rivelazione != null) {
            RivelazioneCard(vm, s)
        } else {
            GiocatoreCard(vm, s)
            if (s.fase == Fase.SPAREGGIO) {
                Card(
                    Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))
                ) {
                    Text(
                        "⚖ Spareggio al pari di ${vm.pariSpareggio()} FMM: offerte da ${vm.minSpareggio()} in su (0 = ritiro)",
                        Modifier.padding(10.dp),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            LazyColumn(Modifier.weight(1f)) {
                items(s.partecipanti.size) { i ->
                    val p = s.partecipanti[i]
                    RigaPartecipante(vm, s, p.id, p.nome) { bustaPer = p.id }
                }
            }
            ComandiBanditore(vm, s)
        }
    }
    bustaPer?.let { id ->
        val p = s.partecipanti.firstOrNull { it.id == id } ?: return
        DialogoBusta(vm, id, p.nome, s.corrente?.nome ?: "") { bustaPer = null }
    }
}

@Composable
private fun GiocatoreCard(vm: AstaViewModel, s: StatoAsta) {
    val g = s.corrente ?: return
    var mostraBase by remember { mutableStateOf(false) }
    var chiedeBase by remember { mutableStateOf(false) }
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(28.dp).background(coloreRuolo.getValue(g.ruolo), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(g.ruolo.codice, color = Color.White, fontWeight = FontWeight.Bold)
                }
                Text(
                    "  ${g.ruolo.etichetta} · round ${s.roundId}",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                g.nome,
                fontSize = 34.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                lineHeight = 38.sp
            )
            Spacer(Modifier.height(6.dp))
            if (mostraBase) {
                Text("Quotazione base: ${g.quotazioneBase} FMM (solo banditore)", fontWeight = FontWeight.SemiBold)
            } else {
                TextButton(onClick = { chiedeBase = true }) {
                    Text("👁 Solo banditore: mostra quotazione base", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    if (chiedeBase) {
        AlertDialog(
            onDismissRequest = { chiedeBase = false },
            title = { Text("Mostrare la quotazione base?") },
            text = { Text("Visibile solo al banditore: assicurati che i partecipanti non stiano guardando lo schermo.") },
            confirmButton = {
                TextButton(onClick = { chiedeBase = false; mostraBase = true }) { Text("Mostra") }
            },
            dismissButton = { TextButton(onClick = { chiedeBase = false }) { Text("Annulla") } }
        )
    }
}

@Composable
private fun RigaPartecipante(vm: AstaViewModel, s: StatoAsta, id: Int, nome: String, onApriBusta: () -> Unit) {
    val sb = vm.statoBid(id)
    val squadra = s.squadre[id]
    val attivo = sb == StatoBid.IN_ATTESA
    Card(
        Modifier.fillMaxWidth().padding(vertical = 3.dp).clickable(enabled = attivo) { onApriBusta() },
        colors = CardDefaults.cardColors(
            containerColor = when {
                sb == StatoBid.PUNTATO -> Color(0xFFE8F5E9)
                sb == StatoBid.RITIRATO -> MaterialTheme.colorScheme.surfaceVariant
                !attivo -> MaterialTheme.colorScheme.surfaceVariant
                else -> MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(nome, fontWeight = FontWeight.SemiBold)
                Text(
                    "${squadra?.budgetResiduo ?: 0} FMM · rosa ${squadra?.rosa?.size ?: 0}/${s.config.totaleSlot}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                when (sb) {
                    StatoBid.IN_ATTESA -> "punta ▸"
                    StatoBid.PUNTATO -> "✅ busta chiusa"
                    StatoBid.ESCLUSO_REPARTO -> "🚫 reparto completo"
                    StatoBid.FUORI_BUDGET -> "💰 budget insufficiente"
                    StatoBid.FUORI_SPAREGGIO -> "— fuori spareggio"
                    StatoBid.RITIRATO -> "🏳 ritirato"
                },
                style = MaterialTheme.typography.bodySmall,
                fontWeight = if (attivo) FontWeight.Bold else FontWeight.Normal
            )
        }
    }
}

@Composable
private fun ComandiBanditore(vm: AstaViewModel, s: StatoAsta) {
    var confermaChiusura by remember { mutableStateOf(false) }
    var confermaSalta by remember { mutableStateOf(false) }
    var confermaTermine by remember { mutableStateOf(false) }
    Column {
        HorizontalDivider(Modifier.padding(vertical = 6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { confermaChiusura = true }) { Text("🔔 Chiudi ora") }
            TextButton(onClick = { confermaSalta = true }) { Text("⏭ Salta") }
            TextButton(onClick = { vm.schermata = Schermata.SQUADRE }) { Text("📋 Squadre") }
            TextButton(onClick = { confermaTermine = true }) { Text("⏹ Termina") }
        }
    }
    if (confermaChiusura) {
        AlertDialog(
            onDismissRequest = { confermaChiusura = false },
            title = { Text("Chiudere l'asta di questo giocatore?") },
            text = { Text("Le buste non ancora consegnate valgono come passo (0).") },
            confirmButton = { TextButton(onClick = { confermaChiusura = false; vm.forzaChiusura() }) { Text("Chiudi") } },
            dismissButton = { TextButton(onClick = { confermaChiusura = false }) { Text("Annulla") } }
        )
    }
    if (confermaSalta) {
        AlertDialog(
            onDismissRequest = { confermaSalta = false },
            title = { Text("Saltare ${s.corrente?.nome}?") },
            text = { Text("Il giocatore sarà svincolato definitivamente.") },
            confirmButton = { TextButton(onClick = { confermaSalta = false; vm.salta() }) { Text("Salta") } },
            dismissButton = { TextButton(onClick = { confermaSalta = false }) { Text("Annulla") } }
        )
    }
    if (confermaTermine) {
        AlertDialog(
            onDismissRequest = { confermaTermine = false },
            title = { Text("Terminare la serata?") },
            text = { Text("L'asta si chiude qui: le rose restano salvate e consultabili.") },
            confirmButton = { TextButton(onClick = { confermaTermine = false; vm.termina() }) { Text("Termina") } },
            dismissButton = { TextButton(onClick = { confermaTermine = false }) { Text("Annulla") } }
        )
    }
}

// ------------------------------------------------------------------ OFFERTA (busta)

@Composable
fun DialogoBusta(vm: AstaViewModel, idPartecipante: Int, nome: String, nomeGiocatore: String, onChiuso: () -> Unit) {
    var cifra by remember { mutableStateOf("") }
    val min = vm.minOfferta()
    val max = vm.maxOfferta(idPartecipante)
    Dialog(onDismissRequest = onChiuso) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Busta di $nome", fontWeight = FontWeight.Bold)
                Text(nomeGiocatore, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    if (cifra.isEmpty()) "—" else cifra,
                    fontSize = 44.sp,
                    fontWeight = FontWeight.Black
                )
                Text(
                    "min $min · max $max · 0 = passo",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(10.dp))
                LazyVerticalGrid(columns = GridCells.Fixed(3), modifier = Modifier.height(190.dp)) {
                    items(listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "⌫", "C")) { t ->
                        TextButton(
                            onClick = {
                                when (t) {
                                    "⌫" -> cifra = cifra.dropLast(1)
                                    "C" -> cifra = ""
                                    else -> if (cifreValide(cifra + t)) cifra += t
                                }
                            },
                            modifier = Modifier.padding(2.dp)
                        ) { Text(t, fontSize = 24.sp, fontWeight = FontWeight.Bold) }
                }
                }
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    OutlinedButton(onClick = { vm.offri(idPartecipante, 0); onChiuso() }) {
                        Text("Passo (0)")
                    }
                    Button(
                        onClick = {
                            val v = cifra.toIntOrNull() ?: 0
                            vm.offri(idPartecipante, v)
                            onChiuso()
                        },
                        enabled = cifra.isNotEmpty()
                    ) { Text("Consegna busta") }
                }
            }
        }
    }
}

private fun cifreValide(s: String): Boolean = s.length <= 4 && (s == "0" || !s.startsWith("0"))

// ------------------------------------------------------------------ RIVELAZIONE

@Composable
fun RivelazioneCard(vm: AstaViewModel, s: StatoAsta) {
    val r = s.rivelazione ?: return
    var mostrati by remember { mutableIntStateOf(0) }
    val totale = r.offerteInOrdine.size + if (r.spareggi > 0) r.spareggio.size + 1 else 1
    LaunchedEffect(r) {
        mostrati = 0
        repeat(totale) {
            delay(450)
            mostrati = it + 1
        }
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Asta chiusa per", style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(r.giocatore.nome, fontSize = 30.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(10.dp))
            r.offerteInOrdine.forEachIndexed { i, o ->
                val visibile = mostrati > i
                Text(
                    if (visibile) "${o.partecipante}: ${o.importo}" else "• • •",
                    fontSize = 20.sp,
                    fontWeight = if (visibile) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (visibile) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline
                )
            }
            if (r.spareggi > 0 && r.spareggio.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text("Spareggio:", fontWeight = FontWeight.Bold)
                r.spareggio.forEachIndexed { i, o ->
                    if (mostrati > r.offerteInOrdine.size + i + 1) {
                        Text("${o.partecipante}: ${o.importo}", fontSize = 18.sp)
                    }
                }
            }
            if (mostrati >= totale - 1) {
                Spacer(Modifier.height(10.dp))
                HorizontalDivider()
                Spacer(Modifier.height(10.dp))
                if (r.nonVenduto) {
                    Text(
                        "❌ Non venduto (${r.motivoNonVenduto})",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFC62828)
                    )
                } else {
                    Text(
                        "🏆 ${r.giocatore.nome} → ${r.vincitore} per ${r.importoFinale} FMM",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF1B5E20)
                    )
                }
                if (r.passi.isNotEmpty()) {
                    Text(
                        "Passo: ${r.passi.joinToString(", ")}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
    Spacer(Modifier.height(10.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        TextButton(onClick = { vm.ripetiAnnuncio() }) { Text("🔊 Ripeti voce") }
        if (!r.nonVenduto) {
            TextButton(onClick = { vm.annullaUltima() }) { Text("↩ Annulla") }
        }
        Button(onClick = { vm.prossimo() }) { Text("Prossimo ▶") }
    }
}

// ------------------------------------------------------------------ SQUADRE

@Composable
fun SchermataSquadre(vm: AstaViewModel) {
    val s = vm.stato ?: return
    var selezionato by remember { mutableIntStateOf(0) }
    val ids = s.partecipanti.map { it.id }
    val idAttivo = ids.getOrElse(selezionato) { ids.first() }
    val sq = s.squadre[idAttivo]
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Squadre", fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (s.fase != Fase.FINE) {
                TextButton(onClick = { vm.schermata = Schermata.ASTA }) { Text("← Torna all'asta") }
            }
        }
        ScrollableTabRow(selectedTabIndex = selezionato, edgePadding = 0.dp) {
            s.partecipanti.forEachIndexed { i, p ->
                Tab(
                    selected = i == selezionato,
                    onClick = { selezionato = i },
                    text = { Text(p.nome, maxLines = 1) }
                )
            }
        }
        sq?.let { squadra ->
            LazyColumn(Modifier.weight(1f).padding(top = 8.dp)) {
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Row {
                                Text(
                                    "${squadra.budgetResiduo} FMM residui",
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                                Text("rosa ${squadra.rosa.size}/${s.config.totaleSlot}")
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                s.config.ordineRuoli.joinToString("   ") { r ->
                                    "${r.codice} ${squadra.countRuolo(r, s.config.quote)}/${s.config.quote[r]}"
                                },
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                s.config.ordineRuoli.forEach { r ->
                    val lista = squadra.rosa.filter { it.giocatore.ruolo == r }
                    if (lista.isNotEmpty()) {
                        item {
                            Text(
                                "${r.etichetta} (${lista.size})",
                                color = coloreRuolo.getValue(r),
                                fontWeight = FontWeight.Bold
                            )
                        }
                        items(lista.size) { i ->
                            val a = lista[i]
                            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                                Text(a.giocatore.nome, Modifier.weight(1f))
                                Text("${a.importo}", fontWeight = FontWeight.SemiBold)
                            }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ FINE

@Composable
fun SchermataFine(vm: AstaViewModel) {
    val s = vm.stato ?: return
    val ctx = LocalContext.current
    val clipboard = LocalClipboardManager.current
    LazyColumn(Modifier.fillMaxSize().statusBarsPadding().padding(16.dp)) {
        item {
            Text("🏁 Asta conclusa", fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text(s.config.nomeLega, style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(12.dp))
        }
        items(s.partecipanti.size) { i ->
            val p = s.partecipanti[i]
            val sq = s.squadre.getValue(p.id)
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(p.nome, fontWeight = FontWeight.Bold)
                        Text(
                            "rosa ${sq.rosa.size}/${s.config.totaleSlot} · speso ${s.config.budgetIniziale - sq.budgetResiduo}",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    Text("${sq.budgetResiduo} FMM", fontWeight = FontWeight.Bold)
                }
            }
        }
        item {
            if (s.nonVenduti.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Svincolati: ${s.nonVenduti.size}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    try {
                        val file = vm.fileCsv()
                        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", file)
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/csv"
                            putExtra(Intent.EXTRA_STREAM, uri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        ctx.startActivity(Intent.createChooser(intent, "Esporta rose"))
                    } catch (e: Exception) {
                        vm.messaggio = "Esportazione fallita: ${e.message}"
                    }
                },
                Modifier.fillMaxWidth()
            ) { Text("📤 Esporta CSV delle squadre") }
            OutlinedButton(
                onClick = { clipboard.setText(AnnotatedString(vm.csvTesto())) },
                Modifier.fillMaxWidth().padding(top = 6.dp)
            ) { Text("📋 Copia riepilogo negli appunti") }
            TextButton(onClick = { vm.nuovaAsta() }, modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                Text("🆕 Nuova asta (cancella la sessione)")
            }
        }
    }
}
