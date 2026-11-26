"use client"

// اتصال به QZ Tray روی سیستم کاربر برای چاپ مستقیم روی پرینتر مشخص (بدون پنجره‌ی چاپ مرورگر)
// اگر QZ Tray اجرا نباشد، همه‌ی توابع false/خطا برمی‌گردانند تا صفحه به چاپ معمولی برگردد.

let qzPromise: Promise<any> | null = null

async function getQz(): Promise<any> {
  if (!qzPromise) {
    qzPromise = (async () => {
      const mod: any = await import("qz-tray")
      const qz = mod.default ?? mod
      // بدون امضای دیجیتال: QZ یک بار پنجره‌ی «اجازه دسترسی» می‌دهد که با «به‌خاطر بسپار» ماندگار می‌شود
      if (qz.security?.setCertificatePromise) {
        qz.security.setCertificatePromise((resolve: any) => resolve())
      }
      if (qz.security?.setSignaturePromise) {
        qz.security.setSignaturePromise(() => (resolve: any) => resolve())
      }
      return qz
    })()
  }
  return qzPromise
}

/** آیا QZ Tray روی سیستم کاربر در دسترس است؟ */
export async function qzAvailable(): Promise<boolean> {
  try {
    const qz = await getQz()
    if (!qz.websocket.isActive()) {
      await qz.websocket.connect()
    }
    return true
  } catch {
    return false
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || "")
      resolve(url.slice(url.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error("خطا در خواندن فایل PDF"))
    reader.readAsDataURL(blob)
  })
}

/** چاپ یک PDF (به‌صورت blob) روی پرینتر نام‌برده — بدون هیچ پنجره‌ای */
export async function qzPrintPdf(pdf: Blob, printerName: string): Promise<void> {
  const qz = await getQz()
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect()
  }
  const data = await blobToBase64(pdf)
  const config = qz.configs.create(printerName)
  await qz.print(config, [{ type: "pdf", format: "base64", data }])
}
