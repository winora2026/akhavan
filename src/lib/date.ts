import DateObject from "react-date-object"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

export function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
}

// تبدیل درست تاریخ شمسی به میلادی (قبلاً با فرمول سال+۶۲۱ محاسبه می‌شد که غلط بود)
export function safeDate(value: any): Date {
  if (!value) return new Date()
  if (value instanceof Date && !isNaN(value.getTime())) return value

  const str = toEnglishDigits(String(value).trim())
  const jalaliMatch = str.match(/^(\d{3,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)

  if (jalaliMatch) {
    try {
      const dObj = new DateObject({
        date: str,
        format: "YYYY/M/D",
        calendar: persian,
        locale: persian_fa,
      })
      const d = dObj.toDate()
      if (!isNaN(d.getTime())) return d
    } catch {
      // ادامه به حالت زیر
    }
  }

  const d = new Date(str)
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) return d
  return new Date()
}