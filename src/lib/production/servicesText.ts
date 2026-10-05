// استخراج عنوان خدمات از servicesData با فرمت‌های مختلف:
// آرایه‌ی آبجکت (title/name/serviceName/label)، آرایه‌ی رشته، آبجکت با کلید services/items،
// رشته‌ی JSON، و JSON دوبار encode شده
function serviceTitle(s: any): string {
  if (s == null) return ""
  if (typeof s === "string" || typeof s === "number") return String(s).trim()
  const t =
    s.title ||
    s.name ||
    s.serviceName ||
    s.label ||
    s.text ||
    s.service?.title ||
    s.service?.name ||
    ""
  return String(t).trim()
}

export function buildServicesText(servicesData: any): string {
  if (!servicesData) return ""
  try {
    let parsed: any = servicesData
    if (typeof parsed === "string") parsed = JSON.parse(parsed)
    if (typeof parsed === "string") parsed = JSON.parse(parsed) // دوبار encode
    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      parsed = parsed.services ?? parsed.items ?? Object.values(parsed)
    }
    if (!Array.isArray(parsed)) return ""
    // هر خدمت در یک خط جدا؛ جداکننده «\n» است چون خود عنوان خدمت ممکن است + داشته باشد
    return parsed.map(serviceTitle).filter(Boolean).join("\n")
  } catch {
    // اگر JSON نبود ولی متن ساده بود، همان را نشان بده
    return typeof servicesData === "string" ? servicesData.trim() : ""
  }
}
