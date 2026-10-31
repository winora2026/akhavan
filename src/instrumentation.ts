// گرم کردن کش سپیدار هنگام بالا آمدن سرور، تا اولین فاکتورِ بعد از ری‌استارت منتظر خواندن کل لیست‌ها نماند.
// مسیر فایل: src/instrumentation.ts (کنار پوشه‌ی app)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.SEPIDAR_MOCK !== "false") return

  const { warmParties } = await import("@/lib/sepidar/party")
  const { warmItems } = await import("@/lib/sepidar/mapOrder")

  // بدون await: سرور همین حالا بالا می‌آید و کش در پس‌زمینه پر می‌شود
  warmParties().catch((e) => console.error("Sepidar warm-up (parties):", e))
  warmItems().catch((e) => console.error("Sepidar warm-up (items):", e))
}