package com.fantacalcio.astachiusa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel
import com.fantacalcio.astachiusa.ui.AppAsta
import com.fantacalcio.astachiusa.ui.AstaViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Color(0xFF1B5E20),
                    primaryContainer = Color(0xFFDCEDC8),
                    secondary = Color(0xFF00695C),
                    tertiary = Color(0xFFC62828)
                )
            ) {
                AppAsta(viewModel<AstaViewModel>())
            }
        }
    }
}
