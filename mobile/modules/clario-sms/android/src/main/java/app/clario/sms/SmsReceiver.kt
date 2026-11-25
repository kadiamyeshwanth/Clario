package app.clario.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Woken by Android for each incoming SMS, even when Clario isn't running.
 * Bank / UPI messages are forwarded to the user's Clario webhook; everything
 * else is ignored on the phone and never sent anywhere.
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val ctx = context.applicationContext
    if (!SmsForwarder.isEnabled(ctx) || SmsForwarder.webhookUrl(ctx).isNullOrBlank()) return

    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    // A long SMS arrives as several parts from the same sender: join them.
    val bySender = linkedMapOf<String, StringBuilder>()
    var receivedAt = System.currentTimeMillis()
    for (p in parts) {
      val from = p.originatingAddress ?: "unknown"
      bySender.getOrPut(from) { StringBuilder() }.append(p.messageBody ?: "")
      if (p.timestampMillis > 0) receivedAt = p.timestampMillis
    }
    val financial = bySender.filter { (from, body) -> SmsForwarder.looksFinancial(from, body.toString()) }
    if (financial.isEmpty()) return

    // Network work can't run on the receiver's main thread; goAsync keeps the
    // process alive for it (Android allows ~10s, enough for one POST).
    val pending = goAsync()
    Thread {
      try {
        for ((from, body) in financial) SmsForwarder.handle(ctx, from, body.toString(), receivedAt)
      } finally {
        pending.finish()
      }
    }.start()
  }
}
