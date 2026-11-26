import { execFile } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

// رندر PDF با Chrome بدون‌سر روی همین سرور (محرمانه؛ فقط سمت سرور استفاده شود)

const CHROME_CANDIDATES = [
  process.env.PRINT_CHROME_PATH,
  path.join(process.cwd(), ".chrome/chrome-headless-shell-linux64/chrome-headless-shell"),
  "/home/amb/akhavan/.chrome/chrome-headless-shell-linux64/chrome-headless-shell",
].filter(Boolean) as string[]

export function findChrome(): string | null {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return null
}

/** متغیرهای محیطی لازم برای اجرای Chrome (کتابخانه‌های محلی نصب‌شده بدون sudo) */
function chromeEnv(chrome: string): NodeJS.ProcessEnv {
  const libs = path.resolve(path.dirname(chrome), "..", "libs", "usr/lib/x86_64-linux-gnu")
  return { ...process.env, LD_LIBRARY_PATH: `${libs}:${process.env.LD_LIBRARY_PATH || ""}` }
}

function runChrome(chrome: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      chrome,
      ["--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", ...args],
      { timeout: 60000, env: chromeEnv(chrome), maxBuffer: 16 * 1024 * 1024 },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

/** رندر یک URL داخلی به PDF؛ خروجی در فایل out */
export async function renderUrlToPdf(url: string, out: string): Promise<void> {
  const chrome = findChrome()
  if (!chrome) throw new Error("ابزار ساخت PDF روی سرور نصب نیست")
  await runChrome(chrome, ["--virtual-time-budget=15000", `--print-to-pdf=${out}`, url])
}

/**
 * رندر یک سند HTML کامل (آماده‌ی کلاینت) به PDF.
 * یک <base> و یک @page با ابعاد داده‌شده به <head> اضافه می‌شود تا خروجی دقیقاً
 * همان چیزی باشد که مرورگر با window.print چاپ می‌کرد.
 */
export async function renderHtmlToPdf(
  html: string,
  out: string,
  pageWmm: number,
  pageHmm: number
): Promise<void> {
  const chrome = findChrome()
  if (!chrome) throw new Error("ابزار ساخت PDF روی سرور نصب نیست")

  const base = `http://127.0.0.1:${process.env.PORT || 3000}`
  const inject =
    `<base href="${base}">` +
    `<style>@page { size: ${pageWmm}mm ${pageHmm}mm; margin: 0; }</style>`
  let doc = html
  if (/<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head[^>]*>/i, (m) => `${m}${inject}`)
  } else {
    doc = `${inject}${doc}`
  }

  const tmp = path.join(os.tmpdir(), `render-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(tmp, doc, "utf8")
  try {
    await runChrome(chrome, [
      "--virtual-time-budget=15000",
      "--run-all-compositor-stages-before-draw",
      `--print-to-pdf=${out}`,
      `file://${tmp}`,
    ])
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {}
  }
}
