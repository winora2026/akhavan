"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type Station = {
  id: string
  name: string
  code: string | null
  description: string | null
  sortOrder: number
  isActive: boolean
}

export default function ProductionStationsPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingStation, setEditingStation] = useState<Station | null>(null)

  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [sortOrder, setSortOrder] = useState(0)

  useEffect(() => {
    fetchStations()
  }, [])

  const fetchStations = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/production/stations")
      if (!res.ok) throw new Error("خطا در دریافت ایستگاه‌ها")
      const data = await res.json()
      setStations(data)
    } catch (error) {
      console.error(error)
      alert("خطا در بارگذاری ایستگاه‌ها")
    } finally {
      setLoading(false)
    }
  }

  const seedStations = async () => {
    if (!confirm("آیا همه ایستگاه‌های پیش‌فرض تعریف شوند؟")) return

    try {
      setSeeding(true)
      const res = await fetch("/api/production/stations/seed", {
        method: "POST",
      })
      const data = await res.json()

      if (!res.ok) {
        alert(data.error || "خطا در تعریف ایستگاه‌ها")
        return
      }

      alert(data.message || "ایستگاه‌ها با موفقیت تعریف شدند")
      await fetchStations()
    } catch (error) {
      console.error(error)
      alert("خطا در ارتباط با سرور")
    } finally {
      setSeeding(false)
    }
  }

  const openCreateModal = () => {
    setEditingStation(null)
    setName("")
    setCode("")
    setDescription("")
    setSortOrder(stations.length + 1)
    setShowModal(true)
  }

  const openEditModal = (station: Station) => {
    setEditingStation(station)
    setName(station.name)
    setCode(station.code || "")
    setDescription(station.description || "")
    setSortOrder(station.sortOrder)
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("نام ایستگاه الزامی است")
      return
    }

    try {
      if (editingStation) {
        alert("ویرایش فعلاً در نسخه بعدی اضافه می‌شود")
      } else {
        const res = await fetch("/api/production/stations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() || null,
            description: description.trim() || null,
            sortOrder: Number(sortOrder) || 0,
          }),
        })

        if (!res.ok) throw new Error("خطا در ذخیره")

        await fetchStations()
        setShowModal(false)
      }
    } catch (error) {
      console.error(error)
      alert("خطا در ذخیره ایستگاه")
    }
  }

  return (
    <div
      className="min-h-screen p-4 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
        fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
      }}
      dir="rtl"
    >
      <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003/Vazirmatn-font-face.css" rel="stylesheet" />
      <div className="pointer-events-none fixed inset-0 bg-black/5" />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* هدر */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">مدیریت ایستگاه‌های تولید</h1>
            <p className="text-sm text-blue-800 mt-1">تعریف و مدیریت ایستگاه‌های خط تولید</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={seedStations}
              disabled={seeding}
              className="rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2.5 text-white font-bold shadow transition disabled:opacity-50"
            >
              {seeding ? "در حال تعریف..." : "تعریف خودکار همه ایستگاه‌ها"}
            </button>
            <button
              onClick={openCreateModal}
              className="rounded-xl bg-teal-500 hover:bg-teal-600 px-4 py-2.5 text-white font-bold shadow transition"
            >
              + ایستگاه جدید
            </button>
            <Link
              href="/"
              className="rounded-xl border border-teal-500/40 bg-white/40 hover:bg-white/60 px-4 py-2.5 text-blue-900 font-bold transition"
            >
              بازگشت
            </Link>
          </div>
        </div>

        {/* جدول ایستگاه‌ها */}
        <div className="rounded-2xl bg-teal-500/10 backdrop-blur-2xl p-5 shadow-lg border border-teal-500/20">
          {loading ? (
            <p className="text-center text-blue-700 py-12 text-lg font-bold">در حال بارگذاری...</p>
          ) : stations.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-blue-800 text-lg font-bold mb-4">هنوز ایستگاهی تعریف نشده است</p>
              <button
                onClick={seedStations}
                disabled={seeding}
                className="rounded-xl bg-orange-500 hover:bg-orange-600 px-6 py-3 text-white font-bold disabled:opacity-50"
              >
                {seeding ? "در حال تعریف..." : "تعریف خودکار همه ایستگاه‌ها"}
              </button>
            </div>
          ) : (
            <table className="w-full text-sm text-blue-900">
              <thead>
                <tr className="border-b border-teal-500/30 bg-teal-500/15 text-right">
                  <th className="p-3 font-bold text-center">ردیف</th>
                  <th className="p-3 font-bold">نام ایستگاه</th>
                  <th className="p-3 font-bold text-center">کد</th>
                  <th className="p-3 font-bold">توضیحات</th>
                  <th className="p-3 font-bold text-center">ترتیب</th>
                  <th className="p-3 font-bold text-center">وضعیت</th>
                  <th className="p-3 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station, index) => (
                  <tr
                    key={station.id}
                    className="border-b border-teal-500/10 hover:bg-teal-400/20 bg-white/30 transition"
                  >
                    <td className="p-3 text-center font-bold">{index + 1}</td>
                    <td className="p-3 font-bold">{station.name}</td>
                    <td className="p-3 text-center">{station.code || "—"}</td>
                    <td className="p-3 text-sm">{station.description || "—"}</td>
                    <td className="p-3 text-center">{station.sortOrder}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                          station.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {station.isActive ? "فعال" : "غیرفعال"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => openEditModal(station)}
                        className="rounded-lg bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1.5 text-xs font-bold text-blue-900 transition"
                      >
                        ویرایش
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* مودال ایجاد / ویرایش */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" dir="rtl">
            <h2 className="text-xl font-bold text-blue-950 mb-5">
              {editingStation ? "ویرایش ایستگاه" : "ایستگاه جدید"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">نام ایستگاه *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                  placeholder="مثلاً: برش"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">کد (اختیاری)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                  placeholder="مثلاً: CUT"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">توضیحات</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-blue-900 mb-1">ترتیب نمایش</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full rounded-xl border border-teal-500/30 px-4 py-2.5 focus:border-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700 hover:bg-gray-50"
              >
                انصراف
              </button>
              <button
                onClick={handleSubmit}
                className="rounded-xl bg-teal-500 hover:bg-teal-600 px-5 py-2.5 font-bold text-white"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}