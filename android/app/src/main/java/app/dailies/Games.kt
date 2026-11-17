package app.dailies

// Keep in sync with GAMES in /app.js. `bit` is the game's permanent slot in saved data.
data class Game(val bit: Int, val name: String, val url: String)

val GAMES = listOf(
    Game(0, "Wordle", "https://www.nytimes.com/games/wordle/index.html"),
    Game(1, "Krillion", "https://krillion.io"),
    Game(2, "Farflung", "https://farflung.game"),
    Game(3, "Plain", "https://playplain.app"),
    Game(4, "Chartered", "https://playchartered.com"),
)
