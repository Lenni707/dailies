package app.dailies

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Started by a widget tap: dailies://open/<bit>. Marks the game played and opens it. */
class OpenGameActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val bit = intent.data?.lastPathSegment?.toIntOrNull()
        val game = Games.load(this).firstOrNull { it.bit == bit }
        if (game != null) {
            Store.set(this, game.bit, Store.today(), true)
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(game.url)))
            } catch (_: Exception) {
            }
            val app = applicationContext
            CoroutineScope(Dispatchers.Default).launch { DailiesWidget().updateAll(app) }
        }
        finish()
    }
}
