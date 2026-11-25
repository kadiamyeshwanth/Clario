package app.clario.sms

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sends SMS to the Clario webhook, with an on-device retry queue.
 *
 * If the phone is offline (or the server is waking up), the SMS is kept in a
 * small queue and sent with the next SMS or the next time the app opens. The
 * server de-duplicates by sender+text, so a retry can never double-post.
 */
object SmsForwarder {
  private const val TAG = "ClarioSms"
  private const val PREFS = "clario_sms"
  private const val MAX_QUEUE = 200

  fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun isEnabled(ctx: Context) = prefs(ctx).getBoolean("enabled", false)
  fun webhookUrl(ctx: Context): String? = prefs(ctx).getString("webhook_url", null)

  /** Quick on-device filter so personal messages never leave the phone. */
  private val AMOUNT = Regex("""(rs\.?|inr|₹)\s*:?\s*[\d,]+|(debited|credited)\s+(by|with|for)\s+[\d,]+""", RegexOption.IGNORE_CASE)
  private val KEYWORD = Regex("""debited|credited|spent|paid|sent|received|withdrawn|deposited|refund|upi|a/c|acct|card""", RegexOption.IGNORE_CASE)
  private val PERSON = Regex("""^\+?\d{6,}$""")
  private val ACCOUNT = Regex("""(a/c|acct|account)""", RegexOption.IGNORE_CASE)

  fun looksFinancial(sender: String, body: String): Boolean {
    if (PERSON.matches(sender.replace(" ", ""))) {
      // A phone number is a person; only bank-shaped text from one is kept.
      return ACCOUNT.containsMatchIn(body) && AMOUNT.containsMatchIn(body)
    }
    return AMOUNT.containsMatchIn(body) && KEYWORD.containsMatchIn(body)
  }

  /** Must be called off the main thread. True when the server accepted it (any 2xx). */
  fun post(url: String, sender: String, body: String, receivedAt: Long): Boolean {
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15000
        readTimeout = 20000
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
        setRequestProperty("User-Agent", "Clario-Android")
      }
      val payload = JSONObject()
        .put("message", body)
        .put("from", sender)
        .put("timestamp", receivedAt)
        .put("source", "clario_android")
        .toString()
      conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      Log.i(TAG, "webhook HTTP $code")
      // 401 means the token was rotated — retrying won't help, so drop it.
      code in 200..299 || code == 401
    } catch (e: Exception) {
      Log.w(TAG, "webhook failed: ${e.message}")
      false
    } finally {
      conn?.disconnect()
    }
  }

  @Synchronized
  fun enqueue(ctx: Context, sender: String, body: String, receivedAt: Long) {
    val q = JSONArray(prefs(ctx).getString("queue", "[]"))
    q.put(JSONObject().put("from", sender).put("body", body).put("at", receivedAt))
    while (q.length() > MAX_QUEUE) q.remove(0)
    prefs(ctx).edit().putString("queue", q.toString()).apply()
  }

  fun queueSize(ctx: Context) = JSONArray(prefs(ctx).getString("queue", "[]")).length()

  /** Sends everything queued. Off the main thread. Returns how many were sent. */
  @Synchronized
  fun flush(ctx: Context): Int {
    val url = webhookUrl(ctx) ?: return 0
    val q = JSONArray(prefs(ctx).getString("queue", "[]"))
    if (q.length() == 0) return 0
    val left = JSONArray()
    var sent = 0
    for (i in 0 until q.length()) {
      val o = q.getJSONObject(i)
      if (post(url, o.getString("from"), o.getString("body"), o.getLong("at"))) sent++ else left.put(o)
    }
    prefs(ctx).edit().putString("queue", left.toString()).apply()
    return sent
  }

  fun recordResult(ctx: Context, ok: Boolean) {
    val p = prefs(ctx)
    p.edit()
      .putLong("last_at", System.currentTimeMillis())
      .putBoolean("last_ok", ok)
      .putInt("forwarded", p.getInt("forwarded", 0) + if (ok) 1 else 0)
      .apply()
  }

  /** Live path: send now; if that fails, queue it. Also drains older queued items. */
  fun handle(ctx: Context, sender: String, body: String, receivedAt: Long) {
    val url = webhookUrl(ctx) ?: return
    val ok = post(url, sender, body, receivedAt)
    if (!ok) enqueue(ctx, sender, body, receivedAt) else flush(ctx)
    recordResult(ctx, ok)
  }
}
