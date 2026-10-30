"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DatePicker, { DateObject } from "react-multi-date-picker"
import persian from "react-date-object/calendars/persian"
import persian_fa from "react-date-object/locales/persian_fa"

type BankAccount = {
  id: string
  name: string
  bankName?: string | null
  ownerName?: string | null
  cardNumber?: string | null
  accountNumber?: string | null
  iban?: string | null
}

type Deposit = {
  id: string
  customerName: string
  customerCode?: string | null
  amount: number
  depositDate: string
  receiptImageUrl?: string | null
  notes?: string | null
  status: string
  createdByName?: string | null
  confirmedByName?: string | null
  confirmedAt?: string | null
  bankAccount: BankAccount
}

type Customer = { id: string; name: string; customerCode?: string | null }

function formatPrice(n: number) {
  return Math.round(n).toLocaleString("fa-IR")
}

function formatFaDate(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new DateObject({
      date: new Date(iso),
      calendar: persian,
      locale: persian_fa,
    }).format("YYYY/MM/DD")
  } catch {
    return "—"
  }
}

function formatCard(c?: string | null) {
  if (!c) return "—"
  const d = c.replace(/\D/g, "")
  return d.replace(/(\d{4})(?=\d)/g, "$1-")
}

export default function CustomerDepositsPage() {
  const [rows, setRows] = useState<Deposit[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<{ displayName: string; role: string } | null>(null)

  const today = useMemo(
    () => new DateObject({ calendar: persian, locale: persian_fa }),
    []
  )
  const [fromDate, setFromDate] = useState<any>(today)
  const [toDate, setToDate] = useState<any>(today)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("همه")

  const [showForm, setShowForm] = useState(false)
  const [customerSearch, setCustomerSearch] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [amount, setAmount] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [depositDate, setDepositDate] = useState<any>(today)
  const [notes, setNotes] = useState("")
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const canConfirm = me?.role === "finance" || me?.role === "admin"

  const selectedAccount = accounts.find((a) => a.id === bankAccountId) || null

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers.slice(0, 8)
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.customerCode || "").toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [customerSearch, customers])

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch("/api/auth/me")
        if (r.ok) {
          const d = await r.json()
          if (d.user)
            setMe({ displayName: d.user.displayName, role: d.user.role })
        }
      } catch {}
    })()
    fetch("/api/finance/bank-accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => {})
    fetch("/api/orders")
      .then((r) => r.json())
      .then((orders) => {
        // مشتریان یکتا از سفارش‌ها + در صورت داشتن API مشتری بهتر است همان استفاده شود
        const map = new Map<string, Customer>()
        if (Array.isArray(orders)) {
          for (const o of orders) {
            if (o.customer?.id)
              map.set(o.customer.id, {
                id: o.customer.id,
                name: o.customer.name,
                customerCode: o.customer.customerCode || null,
              })
          }
        }
        setCustomers(Array.from(map.values()))
      })
      .catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const from = fromDate?.toDate?.()?.toISOString?.() || ""
      const to = toDate?.toDate?.()?.toISOString?.() || ""
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (search.trim()) params.set("q", search.trim())
      if (statusFilter !== "همه") params.set("status", statusFilter)
      const res = await fetch(`/api/finance/deposits?${params}`)
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0)
  const pendingCount = rows.filter((r) => r.status === "PENDING").length

  const uploadReceipt = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در آپلود")
      setReceiptUrl(data.url)
    } catch (e: any) {
      alert(e.message || "خطا در آپلود فیش")
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!selectedCustomer && !customerSearch.trim()) {
      alert("نام مشتری را انتخاب یا وارد کنید")
      return
    }
    if (!bankAccountId) {
      alert("حساب بانکی را انتخاب کنید")
      return
    }
    const amt = Number(String(amount).replace(/,/g, ""))
    if (!amt || amt <= 0) {
      alert("مبلغ معتبر وارد کنید")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/finance/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer?.id || null,
          customerName: selectedCustomer?.name || customerSearch.trim(),
          customerCode: selectedCustomer?.customerCode || null,
          amount: amt,
          bankAccountId,
          depositDate: depositDate?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          receiptImageUrl: receiptUrl,
          notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا در ثبت")
      setShowForm(false)
      setAmount("")
      setNotes("")
      setReceiptUrl(null)
      setSelectedCustomer(null)
      setCustomerSearch("")
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    } finally {
      setSaving(false)
    }
  }

  const confirmRow = async (id: string) => {
    if (!confirm("تأیید ثبت این واریزی؟")) return
    try {
      const res = await fetch("/api/finance/deposits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "confirm" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "خطا")
      await load()
    } catch (e: any) {
      alert(e.message || "خطا")
    }
  }

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      dir="rtl"
      style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-black text-blue-950">واریزی‌های مشتریان</h1>
            <p className="text-sm text-blue-800 mt-1">
              ثبت واریز + تأیید مالی | امروز به‌صورت پیش‌فرض فیلتر است
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border px-4 py-2 font-bold text-blue-900"
            >
              داشبورد
            </Link>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2"
            >
              + ثبت واریزی
            </button>
          </div>
        </div>

        {/* فیلتر */}
        <div className="rounded-2xl border border-teal-200 bg-white/90 p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-bold">جستجو</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام / کد مشتری"
            />
          </div>
          <div>
            <label className="text-xs font-bold">از تاریخ</label>
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              inputClass="w-full rounded-xl border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-bold">تا تاریخ</label>
            <DatePicker
              value={toDate}
              onChange={setToDate}
              calendar={persian}
              locale={persian_fa}
              calendarPosition="bottom-right"
              inputClass="w-full rounded-xl border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-bold">وضعیت</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="همه">همه</option>
              <option value="PENDING">در انتظار تأیید</option>
              <option value="CONFIRMED">تأیید شده</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={load}
              className="w-full rounded-xl bg-blue-900 text-white font-bold py-2"
            >
              اعمال فیلتر
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-teal-50 border p-3 text-center">
            <p className="text-xs">تعداد</p>
            <p className="text-xl font-black">{rows.length}</p>
          </div>
          <div className="rounded-xl bg-amber-50 border p-3 text-center">
            <p className="text-xs">در انتظار تأیید</p>
            <p className="text-xl font-black text-amber-700">{pendingCount}</p>
          </div>
          <div className="rounded-xl bg-green-50 border p-3 text-center">
            <p className="text-xs">جمع مبلغ فیلتر</p>
            <p className="text-xl font-black text-green-700">
              {formatPrice(totalAmount)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border overflow-auto bg-white/95">
          {loading ? (
            <p className="p-6 text-center">در حال بارگذاری...</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-teal-700 text-white">
                <tr>
                  <th className="p-2">تاریخ</th>
                  <th className="p-2">کد مشتری</th>
                  <th className="p-2">نام مشتری</th>
                  <th className="p-2">مبلغ</th>
                  <th className="p-2">حساب</th>
                  <th className="p-2">ثبت‌کننده</th>
                  <th className="p-2">فیش</th>
                  <th className="p-2">وضعیت</th>
                  <th className="p-2">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pending = r.status === "PENDING"
                  return (
                    <tr
                      key={r.id}
                      className={
                        pending
                          ? "bg-amber-50 border-b border-amber-100"
                          : "bg-green-50 border-b border-green-100"
                      }
                    >
                      <td className="p-2 text-center">
                        {formatFaDate(r.depositDate)}
                      </td>
                      <td className="p-2 text-center">
                        {r.customerCode || "—"}
                      </td>
                      <td className="p-2 font-bold">{r.customerName}</td>
                      <td className="p-2 text-center font-black">
                        {formatPrice(r.amount)}
                      </td>
                      <td className="p-2 text-xs">
                        <div className="font-bold">{r.bankAccount?.name}</div>
                        {r.bankAccount?.cardNumber && (
                          <div dir="ltr">{formatCard(r.bankAccount.cardNumber)}</div>
                        )}
                        {r.bankAccount?.iban && (
                          <div dir="ltr" className="text-[10px]">
                            {r.bankAccount.iban}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {r.createdByName || "—"}
                      </td>
                      <td className="p-2 text-center">
                        {r.receiptImageUrl ? (
                          <a
                            href={r.receiptImageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-700 font-bold underline"
                          >
                            مشاهده
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {pending ? (
                          <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-bold">
                            در انتظار
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-600 text-white px-2 py-0.5 text-xs font-bold">
                            ✓ تأیید شد
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {pending && canConfirm ? (
                          <button
                            onClick={() => confirmRow(r.id)}
                            className="rounded-lg bg-green-600 text-white px-3 py-1 font-bold text-xs"
                          >
                            تأیید مالی
                          </button>
                        ) : pending ? (
                          <span className="text-xs text-gray-500">—</span>
                        ) : (
                          <span className="text-xs">
                            {r.confirmedByName || ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-gray-500">
                      موردی نیست
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black mb-4">ثبت واریزی جدید</h2>

            <div className="space-y-3">
              <div className="relative">
                <label className="text-xs font-bold">مشتری</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setSelectedCustomer(null)
                  }}
                  placeholder="جستجوی نام یا کد..."
                />
                {customerSearch && !selectedCustomer && (
                  <div className="absolute z-10 left-0 right-0 bg-white border rounded-xl mt-1 max-h-40 overflow-auto shadow">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-right px-3 py-2 hover:bg-teal-50 text-sm"
                        onClick={() => {
                          setSelectedCustomer(c)
                          setCustomerSearch(c.name)
                        }}
                      >
                        {c.name}
                        {c.customerCode ? (
                          <span className="text-xs text-gray-500 mr-2">
                            ({c.customerCode})
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold">مبلغ (تومان)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs font-bold">تاریخ واریز</label>
                <DatePicker
                  value={depositDate}
                  onChange={setDepositDate}
                  calendar={persian}
                  locale={persian_fa}
                  inputClass="w-full rounded-xl border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-xs font-bold">حساب مقصد</label>
                <select
                  className="w-full rounded-xl border px-3 py-2"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  <option value="">انتخاب حساب...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {selectedAccount && (
                  <div className="mt-2 text-xs bg-slate-50 border rounded-xl p-3 space-y-1">
                    {selectedAccount.cardNumber && (
                      <p>
                        کارت:{" "}
                        <b dir="ltr">{formatCard(selectedAccount.cardNumber)}</b>
                      </p>
                    )}
                    {selectedAccount.accountNumber && (
                      <p>
                        حساب:{" "}
                        <b dir="ltr">{selectedAccount.accountNumber}</b>
                      </p>
                    )}
                    {selectedAccount.iban && (
                      <p>
                        شبا: <b dir="ltr">{selectedAccount.iban}</b>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold">فیش واریزی</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadReceipt(f)
                  }}
                />
                {uploading && <p className="text-xs">در حال آپلود...</p>}
                {receiptUrl && (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    className="text-teal-700 text-xs font-bold"
                    rel="noreferrer"
                  >
                    فایل آپلود شد — مشاهده
                  </a>
                )}
              </div>

              <div>
                <label className="text-xs font-bold">توضیحات</label>
                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <p className="text-xs text-gray-600">
                ثبت‌کننده: <b>{me?.displayName || "—"}</b>
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button
                className="rounded-xl border px-4 py-2 font-bold"
                onClick={() => setShowForm(false)}
              >
                انصراف
              </button>
              <button
                className="rounded-xl bg-teal-600 text-white px-4 py-2 font-bold disabled:opacity-50"
                disabled={saving}
                onClick={submit}
              >
                {saving ? "..." : "ثبت واریزی"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}