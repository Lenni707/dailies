package app.dailies

import android.content.Context
import org.json.JSONObject

data class Game(val bit: Int, val name: String, val url: String)

// Keep in sync with DEFAULT_GAMES in /app.js. `bit` is the game's permanent slot in saved progress.
val DEFAULT_GAMES = listOf(
    Game(0, "Wordle", "https://www.nytimes.com/games/wordle/index.html"),
    Game(1, "Krillion", "https://krillion.io"),
    Game(2, "Farflung", "https://farflung.game"),
    Game(3, "Plain", "https://playplain.app"),
    Game(4, "Chartered", "https://playchartered.com"),
)

/** The user's game list, edited in the web page. Same JSON as the website: {"next":n,"games":[{bit,name,url,blurb}]}. */
object Games {
    private const val KEY = "games"

    fun raw(ctx: Context): String = Store.prefs(ctx).getString(KEY, "") ?: ""

    fun setRaw(ctx: Context, value: String) {
        Store.prefs(ctx).edit().putString(KEY, value).commit()
    }

    fun load(ctx: Context): List<Game> {
        val s = raw(ctx)
        if (s.isBlank()) return DEFAULT_GAMES
        return try {
            val arr = JSONObject(s).getJSONArray("games")
            (0 until arr.length()).map {
                val g = arr.getJSONObject(it)
                Game(g.getInt("bit"), g.getString("name"), g.getString("url"))
            }
        } catch (_: Exception) {
            DEFAULT_GAMES
        }
    }
}
