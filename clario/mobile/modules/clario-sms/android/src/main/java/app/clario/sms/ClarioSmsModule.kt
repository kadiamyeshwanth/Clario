package app.clario.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS API for SMS auto-import (Android only).
 *
 *   configure(webhookUrl, enabled)   store where to send and switch on/off
 *   getStatus()                      enabled, permissions, last result, queue size
 *   readInbox(sinceMs, limit)        recent bank-looking SMS, for the backfill
 *   flushQueue()                     send SMS queued while offline
 */
class ClarioSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED

  override fun definition() = ModuleDefinition {
    Name("ClarioSms")

    AsyncFunction("configure") { webhookUrl: String, enabled: Boolean ->
      SmsForwarder.prefs(context).edit()
        .putString("webhook_url", webhookUrl)
        .putBoolean("enabled", enabled)
        .apply()
      true
    }

    Function("getStatus") {
      val p = SmsForwarder.prefs(context)
      mapOf(
        "enabled" to p.getBoolean("enabled", false),
        "configured" to !p.getString("webhook_url", null).isNullOrBlank(),
        "canReceive" to granted(Manifest.permission.RECEIVE_SMS),
        "canRead" to granted(Manifest.permission.READ_SMS),
        "lastAt" to p.getLong("last_at", 0L).toDouble(),
        "lastOk" to p.getBoolean("last_ok", true),
        "forwarded" to p.getInt("forwarded", 0),
        "queued" to SmsForwarder.queueSize(context),
      )
    }

    AsyncFunction("flushQueue") {
      SmsForwarder.flush(context)
    }

    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      if (!granted(Manifest.permission.READ_SMS)) throw SecurityException("READ_SMS permission not granted")
      val out = mutableListOf<Map<String, Any>>()
      val cursor = context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} DESC"
      )
      cursor?.use { c ->
        val a = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val b = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val d = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (c.moveToNext() && out.size < limit) {
          val address = c.getString(a) ?: continue
          val body = c.getString(b) ?: continue
          // Only bank-looking messages leave the phone.
          if (SmsForwarder.looksFinancial(address, body)) {
            out.add(mapOf("address" to address, "body" to body, "date" to c.getLong(d).toDouble()))
          }
        }
      }
      out
    }
  }
}
