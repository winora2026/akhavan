"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "ورود ناموفق")
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
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-teal-900">اخوان</h1>
          <p className="text-sm text-teal-700 mt-1">ورود به سامانه</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-blue-900 mb-1">
              نام کاربری
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-teal-300 px-4 py-3 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="مثلاً hoseini"
              autoComplete="username"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-blue-900 mb-1">
              رمز عبور
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-teal-300 px-4 py-3 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="••••••"
              autoComplete="current-password"
              dir="ltr"
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
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 disabled:opacity-50"
          >
            {loading ? "در حال ورود..." : "ورود"}
          </button>
        </div>
      </form>
    </div>
  )
}