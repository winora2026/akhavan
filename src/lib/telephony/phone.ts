const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"

export function toEnglishDigits(value: string): string {
  let out = ""
  for (const ch of String(value || "")) {
    const fa = FA_DIGITS.indexOf(ch)
    const ar = AR_DIGITS.indexOf(ch)
    if (fa >= 0) out += String(fa)
    else if (ar >= 0) out += String(ar)
    else out += ch
  }
  return out
}

export function digitsOnly(value: string | null | undefined): string {
  return toEnglishDigits(String(value || "")).replace(/\D/g, "")
}

// شماره‌های ایرانی را برای تطبیق یکسان می‌کند: ۰۹۱۲...، +98912...، 0098912... → 912...
export function normalizePhone(value: string | null | undefined): string {
  let d = digitsOnly(value)
  if (!d) return ""
  if (d.startsWith("0098")) d = d.slice(4)
  else if (d.startsWith("98") && d.length >= 12) d = d.slice(2)
  if (d.startsWith("0")) d = d.slice(1)
  // ۹۸۰۹۱۲... (بدون +) هم دیده می‌شود
  if (d.startsWith("98") && d.length === 12) d = d.slice(2)
  return d
}

export function displayPhone(value: string | null | undefined): string {
  const d = digitsOnly(value)
  if (!d) return ""
  if (d.length === 10 && d.startsWith("9")) return "0" + d
  return d
}
