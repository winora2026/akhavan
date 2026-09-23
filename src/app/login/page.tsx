"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/** نام‌های کاربری قابل انتخاب — با seed واقعی هماهنگ کنید */
const USER_OPTIONS: { username: string; label: string; group: string }[] = [
  { username: "حسینی", label: "خانم حسینی (فروش)", group: "فروش" },
  { username: "قنبرنژاد", label: "خانم قنبرنژاد (فروش)", group: "فروش" },
  { username: "عباس زاده", label: "مائده عباس‌زاده (طراح)", group: "فروش" },
  { username: "فرحی", label: "خانم فرحی (مالی)", group: "مالی" },
  { username: "مجتبی خاجی", label: "مجتبی خاجی (مدیریت)", group: "مدیریت" },
  { username: "برش", label: "ایستگاه برش", group: "تولید" },
  { username: "تراش", label: "ایستگاه تراش", group: "تولید" },
  { username: "تراش الگویی", label: "ایستگاه تراش الگویی", group: "تولید" },
  { username: "دیاموند", label: "ایستگاه دیاموند", group: "تولید" },
  { username: "دیاموند زاویه", label: "ایستگاه دیاموند زاویه", group: "تولید" },
  { username: "لول معمولی", label: "ایستگاه لول معمولی", group: "تولید" },
  { username: "لول براق", label: "ایستگاه لول براق", group: "تولید" },
  { username: "لیمینت", label: "ایستگاه لیمینت", group: "تولید" },
  { username: "دوجداره", label: "ایستگاه دوجداره", group: "تولید" },
  { username: "cnc", label: "ایستگاه CNC", group: "تولید" },
  { username: "led", label: "ایستگاه LED", group: "تولید" },
  { username: "mdf", label: "ایستگاه MDF", group: "تولید" },
  { username: "انبار یک", label: "انبار محصول یک", group: "تولید" },
  { username: "انبار دو", label: "انبار محصول دو", group: "تولید" },
  { username: "بارگیری", label: "ایستگاه بارگیری", group: "تولید" },
  { username: "بسته بندی", label: "ایستگاه بسته‌بندی", group: "تولید" },
  { username: "شست و شو", label: "ایستگاه شست و شو", group: "تولید" },
  { username: "چاپ", label: "ایستگاه چاپ", group: "تولید" },
  { username: "سندبلاست", label: "ایستگاه سندبلاست", group: "تولید" },
  { username: "سوراخکاری", label: "ایستگاه سوراخکاری", group: "تولید" },
  { username: "سکوریت", label: "ایستگاه سکوریت", group: "تولید" },
]
export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // فوکوس خودکار روی نام کاربری
  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  // Escape → پاک کردن خطا / برگشت فوکوس
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setError("")
        setPassword("")
        usernameRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "ورود ناموفق")
        passwordRef.current?.focus()
        return
      }
      router.replace("/")
      router.refresh()
    } catch {
      setError("خطا در ارتباط با سرور")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-fixed"
      dir="rtl"
      style={{
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
        backgroundImage:
          "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/40" />

      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 shadow-2xl p-8 border border-teal-100 backdrop-blur-sm"
        autoComplete="on"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-teal-900">اخوان</h1>
          <p className="text-sm text-teal-700 mt-1">ورود به سامانه</p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="block text-sm font-bold text-blue-900 mb-1"
            >
              نام کاربری
            </label>
            {/* لیست کشویی + امکان تایپ */}
            <input
              id="login-username"
              ref={usernameRef}
              name="username"
              list="user-options"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  passwordRef.current?.focus()
                }
              }}
              className="w-full rounded-xl border border-teal-300 px-4 py-3 font-semibold text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="انتخاب یا تایپ نام کاربری"
              autoComplete="username"
              dir="rtl"
              inputMode="text"
            />
            <datalist id="user-options">
              {USER_OPTIONS.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.label}
                </option>
              ))}
            </datalist>
            <p className="mt-1 text-xs text-gray-500">
              برای ایستگاه‌ها از لیست کشویی انتخاب کنید؛ فروش/مدیریت هم قابل تایپ است.
            </p>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-bold text-blue-900 mb-1"
            >
              رمز عبور
            </label>
            <input
              id="login-password"
              ref={passwordRef}
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-teal-300 px-4 py-3 font-semibold text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder=""
              autoComplete="current-password"
              dir="rtl"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-bold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {loading ? "در حال ورود..." : "ورود"}
          </button>

          <p className="text-center text-xs text-gray-500">
            Enter: رفتن به رمز / ورود · Esc: پاک کردن و فوکوس نام کاربری
          </p>
        </div>
      </form>
    </div>
  )
}