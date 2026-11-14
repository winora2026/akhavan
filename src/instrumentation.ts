// گرم کردن کش سپیدار هنگام بالا آمدن سرور، تا اولین فاکتورِ بعد از ری‌استارت منتظر خواندن کل لیست‌ها نماند.
// مسیر فایل: src/instrumentation.ts (کنار پوشه‌ی app)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return

  if (process.env.TELEPHONY_ENABLED === "true") {
    try {
      const { startTelephony } = await import("@/lib/telephony/bootstrap")
      startTelephony()
    } catch (e) {
      console.error("[telephony] startup failed:", e)
    }
  }

  if (process.env.SEPIDAR_MOCK !== "false") return

  const { warmParties } = await import("@/lib/sepidar/party")
  const { warmItems } = await import("@/lib/sepidar/mapOrder")

  // بدون await: سرور همین حالا بالا می‌آید و کش در پس‌زمینه پر می‌شود
  warmParties().catch((e) => console.error("Sepidar warm-up (parties):", e))
  warmItems().catch((e) => console.error("Sepidar warm-up (items):", e))

  // هر ۱۰ دقیقه: فاکتورهایی که در سپیدار حذف شده‌اند دوباره «ارسال‌نشده» می‌شوند
  // (بدون force؛ اگر تعداد حذف‌شده‌ها مشکوک باشد، چیزی تغییر نمی‌کند)
  const g = globalThis as any
  if (!g.__sepidarReconcileTimer) {
    const run = async () => {
      try {
        const { reconcileSepidarInvoices } = await import("@/lib/sepidar/reconcile")
        const r = await reconcileSepidarInvoices({ apply: true, days: 45 })
        if (r.refused) console.warn("Sepidar reconcile:", r.refused)
        else if (r.applied && (r.missingInSepidar.count || r.markableAsSent.count)) {
          console.log(
            `Sepidar reconcile: ${r.missingInSepidar.count} فاکتور حذف‌شده آزاد شد، ${r.markableAsSent.count} فاکتور ارسال‌شده علامت خورد`
          )
        }
      } catch (e) {
        console.error("Sepidar reconcile (خودکار):", e)
      }
    }
    g.__sepidarReconcileTimer = setInterval(run, 10 * 60_000)
    setTimeout(run, 60_000)
  }
}