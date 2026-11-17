package app.dailies

import android.content.Context
import java.time.LocalDate

/**
 * Progress = map of day number (days since 1970-01-01, local date) to a bitmask of games played.
 * Stored as the same string the website keeps in its cookie: "2.<startDay base36>.<width>.<base32 per day>".
 * The app's WebView and the widgets both read and write it here.
 */
object Store {
    private const val PREFS = "dailies"
    private const val KEY = "data"
    private const val KEEP_DAYS = 400L
    private val W = (GAMES.maxOf { it.bit } + 1 + 4) / 5

    fun today(): Long = LocalDate.now().toEpochDay()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun raw(ctx: Context): String = prefs(ctx).getString(KEY, "") ?: ""

    @Synchronized
    fun setRaw(ctx: Context, value: String) {
        prefs(ctx).edit().putString(KEY, value).commit()
    }

    fun load(ctx: Context): Map<Long, Int> = decode(raw(ctx))

    fun has(days: Map<Long, Int>, bit: Int, day: Long = today()) =
        ((days[day] ?: 0) and (1 shl bit)) != 0

    fun count(days: Map<Long, Int>, day: Long = today()) = GAMES.count { has(days, it.bit, day) }

    fun streak(days: Map<Long, Int>, bit: Int): Int {
        var d = today()
        if (!has(days, bit, d)) d-- // not played yet today doesn't break it
        var n = 0
        while (has(days, bit, d)) { n++; d-- }
        return n
    }

    @Synchronized
    fun set(ctx: Context, bit: Int, day: Long, on: Boolean) {
        val days = load(ctx).toMutableMap()
        val m = days[day] ?: 0
        val next = if (on) m or (1 shl bit) else m and (1 shl bit).inv()
        if (next == 0) days.remove(day) else days[day] = next
        setRaw(ctx, encode(days))
    }

    @Synchronized
    fun toggle(ctx: Context, bit: Int, day: Long = today()) = set(ctx, bit, day, !has(load(ctx), bit, day))

    fun encode(days: Map<Long, Int>): String {
        val keys = days.filterValues { it != 0 }.keys
        if (keys.isEmpty()) return ""
        val end = keys.max()
        val start = maxOf(keys.min(), end - KEEP_DAYS)
        val sb = StringBuilder()
        for (d in start..end) sb.append(Integer.toString(days[d] ?: 0, 32).padStart(W, '0'))
        return "2.${java.lang.Long.toString(start, 36)}.$W.$sb"
    }

    fun decode(s: String): Map<Long, Int> {
        val p = s.split(".")
        if (p.size < 4 || p[0] != "2" || p[3].isEmpty()) return emptyMap()
        val start = p[1].toLongOrNull(36) ?: return emptyMap()
        val w = p[2].toIntOrNull()?.takeIf { it > 0 } ?: return emptyMap()
        val body = p[3]
        val out = HashMap<Long, Int>()
        var i = 0
        while (i * w < body.length) {
            val m = body.substring(i * w, minOf(body.length, i * w + w)).toIntOrNull(32) ?: 0
            if (m != 0) out[start + i] = m
            i++
        }
        return out
    }
}
