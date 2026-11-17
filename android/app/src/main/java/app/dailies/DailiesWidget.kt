package app.dailies

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import android.appwidget.AppWidgetManager
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.time.LocalDate
import java.util.Locale

class DailiesWidget : GlanceAppWidget() {
    // Exact: LocalSize is the real widget size, so the squares can be sized to fit.
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            // Reading this version is what makes Glance recompose when progress changes;
            // without a state read it skips recomposition and the widget stays stale.
            currentState(Version)
            Content(Store.load(context), Games.load(context))
        }
    }
}

private val Version = longPreferencesKey("version")

/** Redraw every Dailies widget with fresh data. Call after any change to progress or games. */
suspend fun refreshWidgets(context: Context) {
    val ids = GlanceAppWidgetManager(context).getGlanceIds(DailiesWidget::class.java)
    val widget = DailiesWidget()
    for (id in ids) {
        updateAppWidgetState(context, id) { it[Version] = System.currentTimeMillis() }
        widget.update(context, id)
    }
}

// Four entries in the widget picker (different default sizes); all render the same widget and adapt to its size.
open class DailiesReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DailiesWidget()

    // Periodic update (every 30 min) and first placement: redraw so a new day shows up.
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds) // Glance holds the broadcast open (goAsync) itself
        val app = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch { refreshWidgets(app) }
    }
}
class TinyReceiver : DailiesReceiver()
class SmallReceiver : DailiesReceiver()
class WideReceiver : DailiesReceiver()
class LargeReceiver : DailiesReceiver()

val BitKey = ActionParameters.Key<Int>("bit")

class ToggleAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val bit = parameters[BitKey] ?: return
        Store.toggle(context, bit)
        refreshWidgets(context)
    }
}

/* ---------- colours (resources: Material You on Android 12+, fixed palette before) ---------- */

private val Bg = ColorProvider(R.color.w_bg)
private val Fg = ColorProvider(R.color.w_text)
private val Muted = ColorProvider(R.color.w_muted)
private val Done = ColorProvider(R.color.w_done)
private val OnDone = ColorProvider(R.color.w_on_done)
private val Heat = listOf(R.color.heat0, R.color.heat1, R.color.heat2, R.color.heat3, R.color.heat4, R.color.heat5)
    .map { ColorProvider(it) }

private fun style(size: Int, color: ColorProvider = Fg, weight: FontWeight = FontWeight.Normal, mono: Boolean = false) =
    TextStyle(color = color, fontSize = size.sp, fontWeight = weight, fontFamily = if (mono) FontFamily.Monospace else null)

@Composable
private fun openGame(game: Game): Action {
    val ctx = LocalContext.current
    return actionStartActivity(
        Intent(ctx, OpenGameActivity::class.java).setData(Uri.parse("dailies://open/${game.bit}"))
    )
}

private val openApp: Action get() = actionStartActivity<MainActivity>()

/* ---------- layout ---------- */

@Composable
private fun Content(days: Map<Long, Int>, games: List<Game>) {
    val size = LocalSize.current
    val tiny = size.height < 100.dp
    val padH = if (tiny) 12.dp else 16.dp
    val padV = if (tiny) 8.dp else 16.dp
    val w = size.width - padH * 2
    val h = size.height - padV * 2
    Box(
        // Tapping anywhere that isn't a square/button opens the app.
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(R.dimen.widget_radius).clickable(openApp)
            .background(Bg).padding(horizontal = padH, vertical = padV),
        contentAlignment = Alignment.Center,
    ) {
        when {
            games.isEmpty() -> Text("Add games in the app", style = style(12, Muted))
            size.height < 100.dp -> Today(days, games, w, h)
            size.width < 200.dp -> UpNext(days, games)
            size.height < 240.dp -> ThisWeek(days, games)
            else -> Overview(days, games)
        }
    }
}

/** 2×1: "Dailies" + today's count on top, one square per game below. Tap a square to play it. */
@Composable
private fun Today(days: Map<Long, Int>, games: List<Game>, w: Dp, h: Dp) {
    val shown = games.take(10)
    val gap = 6.dp
    val titleH = 16.dp
    val spacer = 6.dp
    // Each game gets an equal slot of the width; the square is the slot minus the gap,
    // capped by the height left under the title. 1dp of slack so rounding never clips.
    val slot = (w - 1.dp) / shown.size
    val tile = minOf(slot - gap, h - titleH - spacer - 1.dp).coerceAtLeast(8.dp)
    Column(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
        Row(GlanceModifier.fillMaxWidth().height(titleH).clickable(openApp), verticalAlignment = Alignment.CenterVertically) {
            Text("Dailies", style = style(12, Fg, FontWeight.Medium))
            Spacer(GlanceModifier.defaultWeight())
            Text("${Store.count(days, games)}/${games.size}", style = style(11, Muted, mono = true))
        }
        Spacer(GlanceModifier.height(spacer))
        Row(GlanceModifier.fillMaxWidth()) {
            shown.forEachIndexed { i, g ->
                // first square sits flush with the title; the gap goes after each square
                Box(GlanceModifier.width(slot).height(tile).padding(end = if (i < shown.size - 1) gap else 0.dp)) {
                    Square(g, Store.has(days, g.bit), tile, GlanceModifier.clickable(openGame(g)))
                }
            }
        }
    }
}

/** 2×2: how today is going and a button for the next game. */
@Composable
private fun UpNext(days: Map<Long, Int>, games: List<Game>) {
    val done = Store.count(days, games)
    val next = games.firstOrNull { !Store.has(days, it.bit) }
    Column(GlanceModifier.fillMaxSize()) {
        Column(GlanceModifier.fillMaxWidth().defaultWeight().clickable(openApp)) {
            Text("Today", style = style(12, Muted))
            Text("$done/${games.size}", style = style(34, weight = FontWeight.Medium, mono = true))
        }
        val pill = GlanceModifier.fillMaxWidth().height(40.dp).cornerRadius(12.dp)
        if (next != null) {
            Box(pill.background(Done).clickable(openGame(next)), contentAlignment = Alignment.Center) {
                Text("Play ${next.name}", style = style(13, OnDone, FontWeight.Medium), maxLines = 1)
            }
        } else {
            val streak = Store.fullStreak(days, games)
            Box(pill.background(Heat[0]).clickable(openApp), contentAlignment = Alignment.Center) {
                Text(if (streak > 1) "All done · $streak days" else "All done", style = style(13, Fg, FontWeight.Medium))
            }
        }
    }
}

/** 4×2: today's count and streak on the left, Monday–Sunday on the right. */
@Composable
private fun ThisWeek(days: Map<Long, Int>, games: List<Game>) {
    val done = Store.count(days, games)
    val streak = Store.fullStreak(days, games)
    Row(GlanceModifier.fillMaxSize().clickable(openApp), verticalAlignment = Alignment.CenterVertically) {
        Column(GlanceModifier.defaultWeight()) {
            Text("Today", style = style(12, Muted))
            Text("$done/${games.size}", style = style(34, weight = FontWeight.Medium, mono = true))
            Text(if (streak == 1) "1 full day" else "$streak-day streak", style = style(12, Muted))
        }
        Week(days, games, 22.dp)
    }
}

/** 4×4: today's checklist, this week and streaks. */
@Composable
private fun Overview(days: Map<Long, Int>, games: List<Game>) {
    val shown = games.take(7)
    Column(GlanceModifier.fillMaxSize()) {
        Row(GlanceModifier.fillMaxWidth().clickable(openApp), verticalAlignment = Alignment.CenterVertically) {
            Text("Today", style = style(15, weight = FontWeight.Medium))
            Spacer(GlanceModifier.defaultWeight())
            Text("${Store.count(days, games)}/${games.size}", style = style(13, Muted, mono = true))
        }
        Spacer(GlanceModifier.height(8.dp))
        Column(GlanceModifier.fillMaxWidth()) {
            shown.forEach { g ->
                val on = Store.has(days, g.bit)
                Row(
                    GlanceModifier.fillMaxWidth().height(34.dp).clickable(openGame(g)),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Square(
                        g, on, 22.dp,
                        GlanceModifier.clickable(actionRunCallback<ToggleAction>(actionParametersOf(BitKey to g.bit))),
                        letter = false,
                    )
                    Spacer(GlanceModifier.width(12.dp))
                    Text(g.name, modifier = GlanceModifier.defaultWeight(),
                        style = style(14, if (on) Muted else Fg, FontWeight.Medium), maxLines = 1)
                    Image(ImageProvider(R.drawable.ic_arrow), contentDescription = null, modifier = GlanceModifier.size(14.dp))
                }
            }
        }
        Spacer(GlanceModifier.defaultWeight())
        Row(GlanceModifier.fillMaxWidth().clickable(openApp), verticalAlignment = Alignment.Bottom) {
            Column(GlanceModifier.defaultWeight()) {
                Text("${Store.fullStreak(days, games)}", style = style(22, weight = FontWeight.Medium, mono = true))
                Text("day streak · best ${Store.bestFullStreak(days, games)}", style = style(11, Muted))
            }
            Week(days, games, 18.dp)
        }
    }
}

/** A game's square for today: accent with a tick when played, otherwise its first letter. */
@Composable
private fun Square(g: Game, on: Boolean, size: Dp, modifier: GlanceModifier, letter: Boolean = true) {
    Box(
        modifier.size(size).cornerRadius(size / 4).background(if (on) Done else Heat[0]),
        contentAlignment = Alignment.Center,
    ) {
        if (on) Image(ImageProvider(R.drawable.ic_tick), contentDescription = "${g.name}, played",
            modifier = GlanceModifier.size(size * 0.6f))
        else if (letter && size >= 20.dp) Text(g.name.take(1).uppercase(),
            style = style((size.value * 0.4f).toInt().coerceIn(9, 22), Muted, FontWeight.Medium))
    }
}

/** Monday–Sunday: one square per day shaded by how many games you played, letters underneath. */
@Composable
private fun Week(days: Map<Long, Int>, games: List<Game>, cell: Dp) {
    val today = Store.today()
    val monday = today - (LocalDate.now().dayOfWeek.value - 1)
    Row {
        for (i in 0 until 7) {
            val day = monday + i
            val date = LocalDate.ofEpochDay(day)
            Column(GlanceModifier.padding(horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                val shade = if (day > today) Heat[0] else Heat[Store.level(Store.count(days, games, day), games.size)]
                Box(GlanceModifier.size(cell).cornerRadius(cell / 4).background(shade)) {}
                Spacer(GlanceModifier.height(4.dp))
                Text(
                    date.dayOfWeek.getDisplayName(java.time.format.TextStyle.NARROW, Locale.getDefault()),
                    style = style(10, if (day == today) Fg else Muted, if (day == today) FontWeight.Bold else FontWeight.Normal),
                )
            }
        }
    }
}
