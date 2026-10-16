package cloud.crowdly.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Online/offline, the counterpart of navigator.onLine plus the browser's online event. */
class Connectivity(context: Context) {
    private val cm = context.getSystemService(ConnectivityManager::class.java)
    private val _online = MutableStateFlow(current())
    val online: StateFlow<Boolean> = _online

    init {
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { _online.value = true }
            override fun onLost(network: Network) { _online.value = current() }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                _online.value = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            }
        })
    }

    private fun current(): Boolean =
        cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
}
