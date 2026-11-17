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
import androidx.glance.appwidget.updateAll
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

class DailiesWidget : GlanceAppWidget() {
    // Exact: LocalSize is the real widget size, so the grid can be sized to fit.
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { Content(Store.load(context), Games.load(context)) }
    }
}

// Three entries in the widget picker (different default sizes); all render the same widget.
open class DailiesReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DailiesWidget()
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
        DailiesWidget().updateAll(context)
    }
}

/* ---------- colours (resources: Material You on Android 12+, fixed palette before) ---------- */

private val Bg = ColorProvider(R.color.w_bg)
private val Fg = ColorProvider(R.color.w_text)
private val Muted = ColorProvider(R.color.w_muted)
private val Done = ColorProvider(R.color.w_done)
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
    val pad = if (size.height < 100.dp) 12.dp else 16.dp
    val inner = Pair(size.width - pad * 2, size.height - pad * 2)
    Box(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(R.dimen.widget_radius)
            .background(Bg).padding(pad)
    ) {
        when {
            size.height < 100.dp -> Tiny(days, games, inner.first, inner.second)
            size.width < 200.dp -> Small(days, games, inner.first, inner.second)
            size.height < 240.dp -> Wide(days, games)
            else -> Large(days, games, inner.first, inner.second)
        }
    }
}

/** 2×1: today's count and the recent weeks as boxes. */
@Composable
private fun Tiny(days: Map<Long, Int>, games: List<Game>, w: Dp, h: Dp) {
    val done = Store.count(days, games)
    Row(GlanceModifier.fillMaxSize().clickable(openApp), verticalAlignment = Alignment.CenterVertically) {
        Column {
            Text("$done/${games.size}", style = style(20, weight = FontWeight.Medium, mono = true))
            Text("today", style = style(11, Muted))
        }
        Spacer(GlanceModifier.width(12.dp))
        Heatmap(days, games, w - 60.dp, h, GlanceModifier.defaultWeight())
    }
}

/** 2×2: header and as many weeks as fit. */
@Composable
private fun Small(days: Map<Long, Int>, games: List<Game>, w: Dp, h: Dp) {
    Column(GlanceModifier.fillMaxSize().clickable(openApp)) {
        Header(days, games)
        Spacer(GlanceModifier.defaultWeight())
        Heatmap(days, games, w, h - 30.dp, GlanceModifier.fillMaxWidth())
    }
}

/** 4×2: today's games as boxes you can tap to open. */
@Composable
private fun Wide(days: Map<Long, Int>, games: List<Game>) {
    Column(GlanceModifier.fillMaxSize()) {
        Header(days, games)
        Spacer(GlanceModifier.defaultWeight())
        Row(GlanceModifier.fillMaxWidth()) {
            games.take(6).forEach { g ->
                val on = Store.has(days, g.bit)
                Column(
                    GlanceModifier.defaultWeight().clickable(openGame(g)),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Tile(on, 30.dp)
                    Spacer(GlanceModifier.height(6.dp))
                    Text(g.name, style = style(11, if (on) Muted else Fg), maxLines = 1)
                }
            }
        }
    }
}

/** 4×4: today's list (tap the box to tick/untick) and the history grid below. */
@Composable
private fun Large(days: Map<Long, Int>, games: List<Game>, w: Dp, h: Dp) {
    val shown = games.take(6)
    val rowH = 36.dp
    Column(GlanceModifier.fillMaxSize()) {
        Header(days, games)
        Spacer(GlanceModifier.height(8.dp))
        Column(GlanceModifier.fillMaxWidth()) {
            shown.forEach { g ->
                val on = Store.has(days, g.bit)
                val streak = Store.streak(days, g.bit)
                Row(
                    GlanceModifier.fillMaxWidth().height(rowH).clickable(openGame(g)),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Tile(
                        on, 22.dp,
                        GlanceModifier.clickable(actionRunCallback<ToggleAction>(actionParametersOf(BitKey to g.bit))),
                    )
                    Spacer(GlanceModifier.width(12.dp))
                    Text(
                        g.name,
                        modifier = GlanceModifier.defaultWeight(),
                        style = style(14, if (on) Muted else Fg, FontWeight.Medium),
                        maxLines = 1,
                    )
                    if (streak > 1) Text("${streak}d", style = style(11, Muted, mono = true))
                    Spacer(GlanceModifier.width(10.dp))
                    Image(ImageProvider(R.drawable.ic_arrow), contentDescription = null, modifier = GlanceModifier.size(14.dp))
                }
            }
        }
        Spacer(GlanceModifier.defaultWeight())
        val gridH = h - 28.dp - rowH * shown.size - 12.dp
        if (gridH >= 42.dp) Heatmap(days, games, w, gridH, GlanceModifier.fillMaxWidth().clickable(openApp))
    }
}

@Composable
private fun Header(days: Map<Long, Int>, games: List<Game>) {
    Row(GlanceModifier.fillMaxWidth().clickable(openApp), verticalAlignment = Alignment.CenterVertically) {
        Text("Dailies", style = style(14, weight = FontWeight.Medium))
        Spacer(GlanceModifier.defaultWeight())
        Text("${Store.count(days, games)}/${games.size}", style = style(12, Muted, mono = true))
    }
}

/** A rounded square: filled with the accent and a tick when played, empty box otherwise. */
@Composable
private fun Tile(on: Boolean, size: Dp, modifier: GlanceModifier = GlanceModifier) {
    Box(
        modifier.size(size).cornerRadius(size / 4).background(if (on) Done else Heat[0]),
        contentAlignment = Alignment.Center,
    ) {
        if (on) Image(ImageProvider(R.drawable.ic_tick), contentDescription = "Played", modifier = GlanceModifier.size(size * 0.7f))
    }
}

/**
 * GitHub-style grid: one column per week (Monday on top), newest on the right,
 * shade = how many of your games you played that day. Square cells, as many weeks as fit.
 */
@Composable
private fun Heatmap(days: Map<Long, Int>, games: List<Game>, w: Dp, h: Dp, modifier: GlanceModifier) {
    val gap = 3.dp
    val cell = minOf(h / 7 - gap, 14.dp).coerceAtLeast(4.dp)
    val weeks = (w / (cell + gap)).toInt().coerceIn(1, 20) // keeps the view count sane
    val today = Store.today()
    val dow = LocalDate.now().dayOfWeek.value - 1 // Monday = 0
    val start = today - dow - (weeks - 1) * 7L

    // RemoteViews allow at most 10 children per row/column, so no spacers (padding makes the gaps)
    // and weeks go in chunks of up to 10.
    val slot = cell + gap
    Row(modifier, horizontalAlignment = Alignment.End) {
        (0 until weeks).chunked(10).forEach { chunk ->
            Row {
                chunk.forEach { wk ->
                    Column {
                        for (d in 0 until 7) {
                            val day = start + wk * 7 + d
                            val shade = if (day > today) null
                                else Heat[Store.level(Store.count(days, games, day), games.size)]
                            Box(GlanceModifier.size(slot).padding(gap / 2)) {
                                Box(
                                    GlanceModifier.fillMaxSize().cornerRadius(cell / 4)
                                        .let { if (shade != null) it.background(shade) else it }
                                ) {}
                            }
                        }
                    }
                }
            }
        }
    }
}
