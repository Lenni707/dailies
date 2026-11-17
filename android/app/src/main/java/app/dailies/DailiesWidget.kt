package app.dailies

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
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

class DailiesWidget : GlanceAppWidget() {
    companion object {
        val SMALL = DpSize(110.dp, 110.dp)
        val WIDE = DpSize(250.dp, 110.dp)
        val TALL = DpSize(250.dp, 290.dp)
    }

    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE, TALL))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent { Content(Store.load(context)) }
    }
}

// Three entries in the widget picker; all render the same responsive widget.
open class DailiesReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DailiesWidget()
}
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

/* ---------- UI ---------- */

private val Bg = ColorProvider(R.color.w_bg)
private val Fg = ColorProvider(R.color.w_text)
private val Muted = ColorProvider(R.color.w_muted)
private val Line = ColorProvider(R.color.w_line)
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

@Composable
private fun Content(days: Map<Long, Int>) {
    val size = LocalSize.current
    val done = Store.count(days)
    Box(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(24.dp).background(Bg).padding(16.dp)
    ) {
        when {
            size.width < DailiesWidget.WIDE.width -> Small(days, done)
            size.height < DailiesWidget.TALL.height -> Wide(days, done)
            else -> Large(days, done)
        }
    }
}

@Composable
private fun Header(done: Int) {
    Row(
        GlanceModifier.fillMaxWidth().clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Dailies", style = style(14, weight = FontWeight.Medium))
        Spacer(GlanceModifier.defaultWeight())
        Text("$done/${GAMES.size}", style = style(12, Muted, mono = true))
    }
}

@Composable
private fun Small(days: Map<Long, Int>, done: Int) {
    Column(GlanceModifier.fillMaxSize().clickable(actionStartActivity<MainActivity>())) {
        Text("Dailies", style = style(12, Muted))
        Spacer(GlanceModifier.defaultWeight())
        Text("$done/${GAMES.size}", style = style(32, weight = FontWeight.Medium))
        Spacer(GlanceModifier.height(8.dp))
        Row {
            GAMES.forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(4.dp))
                Box(
                    GlanceModifier.size(8.dp).cornerRadius(4.dp)
                        .background(if (Store.has(days, g.bit)) Done else Line)
                ) {}
            }
        }
    }
}

@Composable
private fun CheckIcon(on: Boolean, modifier: GlanceModifier) {
    Image(
        ImageProvider(if (on) R.drawable.check_on else R.drawable.check_off),
        contentDescription = if (on) "Played" else "Not played",
        modifier = modifier,
    )
}

@Composable
private fun Wide(days: Map<Long, Int>, done: Int) {
    Column(GlanceModifier.fillMaxSize()) {
        Header(done)
        Spacer(GlanceModifier.defaultWeight())
        Row(GlanceModifier.fillMaxWidth()) {
            GAMES.forEach { g ->
                val on = Store.has(days, g.bit)
                Column(
                    GlanceModifier.defaultWeight().clickable(openGame(g)),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CheckIcon(on, GlanceModifier.size(24.dp))
                    Spacer(GlanceModifier.height(6.dp))
                    Text(g.name, style = style(11, if (on) Muted else Fg), maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun Large(days: Map<Long, Int>, done: Int) {
    Column(GlanceModifier.fillMaxSize()) {
        Header(done)
        Spacer(GlanceModifier.height(10.dp))
        Column(GlanceModifier.fillMaxWidth()) {
            GAMES.forEach { g ->
                val on = Store.has(days, g.bit)
                val streak = Store.streak(days, g.bit)
                Row(
                    GlanceModifier.fillMaxWidth().height(38.dp).clickable(openGame(g)),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CheckIcon(
                        on,
                        GlanceModifier.size(22.dp)
                            .clickable(actionRunCallback<ToggleAction>(actionParametersOf(BitKey to g.bit))),
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
        Text("Last two weeks", style = style(11, Muted))
        Spacer(GlanceModifier.height(6.dp))
        Column(GlanceModifier.fillMaxWidth()) {
            val today = Store.today()
            for (week in 0 until 2) {
                if (week > 0) Spacer(GlanceModifier.height(4.dp))
                Row(GlanceModifier.fillMaxWidth()) {
                    for (i in 0 until 7) {
                        val day = today - 13 + week * 7 + i
                        val c = Store.count(days, day)
                        val shade = Heat[(c * (Heat.size - 1) + GAMES.size - 1) / GAMES.size]
                        Box(GlanceModifier.defaultWeight().height(12.dp).padding(horizontal = 2.dp)) {
                            Box(GlanceModifier.fillMaxSize().cornerRadius(3.dp).background(shade)) {}
                        }
                    }
                }
            }
        }
    }
}
