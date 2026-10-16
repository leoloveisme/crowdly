package cloud.crowdly.app.ui

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cloud.crowdly.app.crowdly
import cloud.crowdly.app.i18n.AppText
import cloud.crowdly.app.i18n.tr
import cloud.crowdly.app.ui.components.errorText
import kotlinx.coroutines.launch

@Composable
fun SignInScreen() {
    val app = crowdly
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signUp by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var server by remember { mutableStateOf(app.prefs.server) }
    var showServer by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth()) {
            Text("Crowdly", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
            AppText("android-signin-tagline", "Every single story has more possibilities", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(32.dp))
            OutlinedTextField(
                email, { email = it }, Modifier.fillMaxWidth(),
                label = { AppText("android-signin-email", "Email") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                password, { password = it }, Modifier.fillMaxWidth(),
                label = { AppText("android-signin-password", "Password") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    busy = true; error = null
                    scope.launch {
                        try {
                            if (signUp) app.session.signUp(email, password) else app.session.signIn(email, password)
                            app.i18n.load()
                        } catch (e: Exception) {
                            error = errorText(e)
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy && email.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (busy) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp)
                else if (signUp) AppText("android-signin-create", "Create account") else AppText("android-signin-submit", "Sign in")
            }
            TextButton(onClick = { signUp = !signUp; error = null }, modifier = Modifier.fillMaxWidth()) {
                if (signUp) AppText("android-signin-have-account", "I already have an account")
                else AppText("android-signin-new", "New to Crowdly? Create an account")
            }
            TextButton(onClick = {
                CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(app.prefs.platformUrl))
            }, modifier = Modifier.fillMaxWidth()) { AppText("android-signin-open-web", "Open Crowdly on the web") }

            Spacer(Modifier.height(24.dp))
            TextButton(onClick = { showServer = !showServer }) {
                Text("${tr("android-signin-server", "Server")}: ${app.prefs.server}", style = MaterialTheme.typography.labelMedium)
            }
            if (showServer) {
                OutlinedTextField(server, { server = it }, Modifier.fillMaxWidth(), singleLine = true, label = { AppText("android-signin-server-url", "Server address") })
                if (server.startsWith("http://")) AppText("android-signin-insecure", "Not encrypted: use only for a development server on your own network.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                TextButton(onClick = { app.prefs.server = server; showServer = false }) { AppText("android-save", "Save") }
            }
        }
    }
}
