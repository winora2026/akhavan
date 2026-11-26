// ───────────── پیامک خودکار ثبت درخواست اندازه‌گیری ─────────────
// بعد از ثبت درخواست در صفحه‌ی /execution/measurement، به اولین شماره‌ی موبایلِ ثبت‌شده
// یک پیامک تأیید ارسال می‌شود. نتیجه در همان رکورد (smsStatus / smsSentAt) ذخیره می‌شود.
// - با MEASUREMENT_SMS_ENABLED=true در .env فعال می‌شود.
// - هیچ‌وقت ارور پرتاب نمی‌کند تا ثبت درخواست خراب نشود.

import { prisma } from "@/lib/prisma"
import { normalizeIranMobile, sendSms } from "@/lib/sms"

export function buildMeasurementSms(customerName: string, measurementNumber: string) {
  return (
    `مشتری گرامی ${customerName}، درخواست اندازه‌گیری شما با شماره ${measurementNumber} ` +
    `در شرکت شیشه و آینه اخوان ثبت شد. هماهنگی حضور در محل انجام می‌شود. تماس: ۰۲۱۹۱۰۰۵۱۰۳`
  )
}

export async function notifyMeasurementRegistered(id: string): Promise<void> {
  try {
    if (process.env.MEASUREMENT_SMS_ENABLED !== "true") return

    const item = await prisma.measurementRequest.findUnique({ where: { id } })
    if (!item) return

    // اولین شماره‌ای که یک موبایل معتبر است
    let phones: string[] = []
    try {
      const v = JSON.parse(item.phones || "[]")
      phones = Array.isArray(v) ? v.map(String) : []
    } catch {
      phones = []
    }
    let mobile: string | null = null
    for (const p of phones) {
      const m = normalizeIranMobile(p)
      if (m) {
        mobile = m
        break
      }
    }

    if (!mobile) {
      await prisma.measurementRequest.update({
        where: { id },
        data: { smsStatus: "FAILED" },
      })
      console.error("measurement sms skipped: no valid mobile")
      return
    }

    const text = buildMeasurementSms(item.customerName, item.measurementNumber)
    const result = await sendSms(mobile, text)

    if (!result.ok) {
      console.error("measurement sms failed:", result.error)
      await prisma.measurementRequest.update({
        where: { id },
        data: { smsStatus: "FAILED" },
      })
      return
    }

    // حالت آزمایشی: وضعیت SENT ثبت نمی‌شود تا بعداً ارسال واقعی گمراه‌کننده نباشد
    if (result.mock) return

    await prisma.measurementRequest.update({
      where: { id },
      data: { smsStatus: "SENT", smsSentAt: new Date() },
    })
  } catch (e: any) {
    console.error("notifyMeasurementRegistered error:", e)
  }
}
