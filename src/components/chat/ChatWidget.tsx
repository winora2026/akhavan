"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Member = {
  id: string
  displayName: string
  role: string
  stationName?: string | null
}

type Conversation = {
  id: string
  type: string
  title: string
  groupKey?: string | null
  updatedAt: string
  unread: number
  lastMessage: {
    body: string
    createdAt: string
    senderName: string
    deleted?: boolean
    orderNumber?: string | null
  } | null
  members: Member[]
}

type ChatMessage = {
  id: string
  body: string | null
  deleted: boolean
  createdAt: string
  editedAt?: string | null
  sender: { id: string; displayName: string; role: string }
  orderNumber?: string | null
  orderId?: string | null
  isMine: boolean
  attachmentUrl?: string | null
  attachmentName?: string | null
  attachmentType?: string | null
  readBy?: string[]
}

type ChatUser = {
  id: string
  displayName: string
  role: string
  stationName?: string | null
}

type ToastItem = {
  id: string
  title: string
  body: string
  conversationId: string
}

const LOGO = "/akhavan-logo.png"

const ROLE_FA: Record<string, string> = {
  sales: "فروش",
  production: "تولید",
  finance: "مالی",
  admin: "مدیریت",
  designer: "طراح",
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("fa-IR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function Avatar({
  title,
  size = 44,
  group = false,
}: {
  title: string
  size?: number
  group?: boolean
}) {
  return (
    <div
      className="rounded-full bg-white border-2 border-teal-200 shadow-sm flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, height: size }}
      title={title}
    >
      <img
        src={LOGO}
        alt={group ? "گروه" : title}
        className="object-contain"
        style={{ width: size * 0.72, height: size * 0.72 }}
        onError={(e) => {
          const el = e.currentTarget
          el.style.display = "none"
          if (el.parentElement) {
            el.parentElement.innerHTML = `<span style="font-size:${Math.floor(
              size * 0.32
            )}px;font-weight:900;color:#0f766e">${
              group ? "گ" : (title || "?").slice(0, 1)
            }</span>`
          }
        }}
      />
    </div>
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"groups" | "direct">("groups")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState("")
  const [orderNumber, setOrderNumber] = useState("")
  const [loadingList, setLoadingList] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const [users, setUsers] = useState<ChatUser[]>([])
  const [compose, setCompose] = useState(false)
  const [composeQuery, setComposeQuery] = useState("")
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [pathname, setPathname] = useState("")
  const [searchConv, setSearchConv] = useState("")
  const [showMembers, setShowMembers] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{
    url: string
    name: string
    type: string
  } | null>(null)

  const knownMsgIds = useRef<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPathname(window.location.pathname)
  }, [])

  const loadConversations = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingList(true)
      try {
        const res = await fetch("/api/chat/conversations")
        if (!res.ok) return
        const data = await res.json()
        const list: Conversation[] = data.conversations || []
        setConversations(list)
        setTotalUnread(list.reduce((s, c) => s + (c.unread || 0), 0))

        for (const c of list) {
          const lm = c.lastMessage
          if (!lm || lm.deleted) continue
          const key = lm.createdAt + c.id + (lm.body || "")
          if (knownMsgIds.current.has(key)) continue
          if (knownMsgIds.current.size === 0) {
            knownMsgIds.current.add(key)
            continue
          }
          knownMsgIds.current.add(key)
          if (open && activeId === c.id) continue
          setToasts((prev) => {
            const id = `${c.id}-${Date.now()}`
            const next = [
              {
                id,
                title: c.title || lm.senderName,
                body: (lm.body || "").slice(0, 80),
                conversationId: c.id,
              },
              ...prev,
            ].slice(0, 3)
            setTimeout(() => {
              setToasts((t) => t.filter((x) => x.id !== id))
            }, 7000)
            return next
          })
        }

        if (knownMsgIds.current.size === 0 && list.length) {
          for (const c of list) {
            if (c.lastMessage) {
              knownMsgIds.current.add(
                c.lastMessage.createdAt + c.id + (c.lastMessage.body || "")
              )
            }
          }
        }
      } catch {
      } finally {
        if (!silent) setLoadingList(false)
      }
    },
    [open, activeId]
  )

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/chat/conversations/${id}/messages`)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages || [])
      setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        40
      )
    } catch {
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/chat/users")
      if (!res.ok) return
      const data = await res.json()
      setUsers(data.users || [])
    } catch {}
  }

  useEffect(() => {
    loadConversations(true)
    pollRef.current = setInterval(() => loadConversations(true), 8000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadConversations])

  useEffect(() => {
    if (activeId && open) {
      setShowMembers(false)
      setEditingId(null)
      loadMessages(activeId)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [activeId, open, loadMessages])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "خطا در آپلود")
        return
      }
      const mime = file.type || ""
      const type = mime.startsWith("image/")
        ? "image"
        : mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
        ? "pdf"
        : "file"
      setPendingFile({
        url: data.url,
        name: data.name || file.name,
        type,
      })
    } catch {
      alert("خطا در آپلود فایل")
    } finally {
      setUploading(false)
    }
  }

  const send = async () => {
    if (!activeId || sending) return
    if (!text.trim() && !pendingFile) return
    setSending(true)
    try {
      const res = await fetch(
        `/api/chat/conversations/${activeId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: text.trim(),
            orderNumber: orderNumber.trim() || undefined,
            attachmentUrl: pendingFile?.url,
            attachmentName: pendingFile?.name,
            attachmentType: pendingFile?.type,
          }),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || "خطا در ارسال")
        return
      }
      setText("")
      setOrderNumber("")
      setPendingFile(null)
      await loadMessages(activeId)
      await loadConversations(true)
      inputRef.current?.focus()
    } finally {
      setSending(false)
    }
  }

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return
    const res = await fetch(`/api/chat/messages/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editText.trim() }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || "خطا در ویرایش")
      return
    }
    setEditingId(null)
    setEditText("")
    if (activeId) loadMessages(activeId)
  }

  const softDelete = async (msgId: string) => {
    if (!confirm("پیام حذف شود؟")) return
    await fetch(`/api/chat/messages/${msgId}`, { method: "DELETE" })
    if (activeId) loadMessages(activeId)
  }

  const startDirect = async (userId: string) => {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || "خطا")
      return
    }
    setCompose(false)
    setComposeQuery("")
    setTab("direct")
    setActiveId(data.conversationId)
    await loadConversations(true)
  }

  const groups = conversations.filter((c) => c.type === "GROUP")
  const directs = conversations.filter((c) => c.type === "DIRECT")
  const list = (tab === "groups" ? groups : directs).filter((c) => {
    if (!searchConv.trim()) return true
    const q = searchConv.trim().toLowerCase()
    return (
      (c.title || "").toLowerCase().includes(q) ||
      (c.lastMessage?.body || "").toLowerCase().includes(q)
    )
  })

  const active = conversations.find((c) => c.id === activeId) || null

  const filteredUsers = users.filter((u) => {
    if (!composeQuery.trim()) return true
    const q = composeQuery.trim().toLowerCase()
    return (
      u.displayName.toLowerCase().includes(q) ||
      (u.stationName || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    )
  })

  if (pathname === "/login") return null

  return (
    <>
      {/* نوتیف */}
      <div
        className="fixed bottom-24 right-4 z-[90] flex flex-col gap-2 print:hidden"
        dir="rtl"
        style={{ maxWidth: 320 }}
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setOpen(true)
              setActiveId(t.conversationId)
              setToasts((x) => x.filter((i) => i.id !== t.id))
            }}
            className="text-right rounded-2xl bg-white shadow-2xl border-2 border-teal-300 px-4 py-3 hover:bg-teal-50 transition"
          >
            <p className="text-sm font-black text-teal-900">{t.title}</p>
            <p className="text-xs text-slate-700 mt-1 line-clamp-2">{t.body}</p>
          </button>
        ))}
      </div>

      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            loadConversations()
          }}
          className="fixed bottom-5 right-5 z-[91] w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-2xl flex items-center justify-center print:hidden"
          title="پیام‌ها"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center px-1">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-900/40 p-2 sm:p-5 print:hidden"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-5xl h-[min(90vh,740px)] bg-white rounded-2xl shadow-2xl overflow-hidden flex border border-teal-200">
            {/* سایدبار */}
            <div className="w-full sm:w-[340px] flex flex-col bg-white border-l border-teal-100">
              <div className="px-3 pt-3 pb-2 flex items-center gap-2 bg-gradient-to-l from-teal-600 to-teal-500">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-white text-2xl leading-none px-1 font-bold"
                >
                  ×
                </button>
                <input
                  value={searchConv}
                  onChange={(e) => setSearchConv(e.target.value)}
                  placeholder="جستجو در گفتگوها..."
                  className="flex-1 rounded-full bg-white text-slate-900 text-sm font-semibold px-4 py-2 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCompose(true)
                    loadUsers()
                  }}
                  className="rounded-full bg-white text-teal-700 w-9 h-9 flex items-center justify-center text-xl font-black shadow"
                  title="پیام جدید"
                >
                  +
                </button>
              </div>

              <div className="flex p-2 gap-1 bg-teal-50">
                <button
                  type="button"
                  onClick={() => {
                    setTab("groups")
                    setActiveId(null)
                  }}
                  className={`flex-1 py-2.5 text-sm font-black rounded-xl ${
                    tab === "groups"
                      ? "bg-teal-600 text-white shadow"
                      : "bg-white text-teal-800 border border-teal-200"
                  }`}
                >
                  گروه‌ها
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("direct")
                    setActiveId(null)
                  }}
                  className={`flex-1 py-2.5 text-sm font-black rounded-xl ${
                    tab === "direct"
                      ? "bg-teal-600 text-white shadow"
                      : "bg-white text-teal-800 border border-teal-200"
                  }`}
                >
                  شخصی
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingList && (
                  <p className="text-teal-800 text-sm p-4 font-bold">
                    بارگذاری...
                  </p>
                )}
                {list.map((c) => {
                  const selected = c.id === activeId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-right transition border-b border-teal-50 ${
                        selected ? "bg-teal-100" : "hover:bg-teal-50/80"
                      }`}
                    >
                      <Avatar
                        title={c.title}
                        group={c.type === "GROUP"}
                        size={48}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2">
                          <p className="text-slate-900 font-black text-sm truncate">
                            {c.title}
                          </p>
                          {c.lastMessage && (
                            <span className="text-[11px] text-teal-700 font-bold shrink-0">
                              {formatTime(c.lastMessage.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-center gap-2 mt-0.5">
                          <p className="text-slate-600 text-xs truncate font-medium">
                            {c.lastMessage
                              ? `${c.lastMessage.senderName}: ${c.lastMessage.body}`
                              : "هنوز پیامی نیست"}
                          </p>
                          {c.unread > 0 && (
                            <span className="rounded-full bg-teal-600 text-white text-[11px] font-black min-w-[22px] h-5 flex items-center justify-center px-1.5">
                              {c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {!list.length && !loadingList && (
                  <p className="text-teal-800 text-sm p-6 text-center font-bold">
                    {tab === "groups"
                      ? "گروهی نیست."
                      : "گفتگوی شخصی نیست. با + پیام جدید بسازید."}
                  </p>
                )}
              </div>
            </div>

            {/* پنل اصلی */}
            <div className="hidden sm:flex flex-1 flex-col bg-[#eef8f5]">
              {!activeId && !compose && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-teal-800/60">
                  <img src={LOGO} alt="اخوان" className="w-16 h-16 object-contain opacity-80" />
                  <p className="text-sm font-black">
                    یک گفتگو را انتخاب کنید یا با + پیام جدید بفرستید
                  </p>
                </div>
              )}

              {compose && (
                <div className="flex-1 flex flex-col bg-white">
                  <div className="h-14 px-4 flex items-center gap-3 border-b border-teal-100 bg-teal-50">
                    <button
                      type="button"
                      onClick={() => setCompose(false)}
                      className="text-teal-900 font-black text-sm"
                    >
                      بازگشت
                    </button>
                    <p className="text-slate-900 font-black text-sm">
                      ارسال به چه کسی؟
                    </p>
                  </div>
                  <div className="p-3 border-b border-teal-50">
                    <input
                      value={composeQuery}
                      onChange={(e) => setComposeQuery(e.target.value)}
                      placeholder="جستجوی نام، واحد، نقش..."
                      className="w-full rounded-xl border-2 border-teal-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 placeholder:text-slate-400"
                      autoFocus
                    />
                  </div>
                  <div className="px-3 py-2 flex flex-wrap gap-2">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setCompose(false)
                          setTab("groups")
                          setActiveId(g.id)
                        }}
                        className="rounded-full bg-teal-50 border-2 border-teal-300 text-teal-900 text-xs font-black px-3 py-1.5 hover:bg-teal-100"
                      >
                        {g.title} ({g.members?.length || 0})
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => startDirect(u.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-teal-50 text-right border-b border-teal-50"
                      >
                        <Avatar title={u.displayName} size={42} />
                        <div>
                          <p className="text-slate-900 font-black text-sm">
                            {u.displayName}
                          </p>
                          <p className="text-teal-800 text-xs font-bold">
                            {u.stationName || ROLE_FA[u.role] || u.role}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeId && active && !compose && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMembers((v) => !v)}
                    className="h-14 px-4 flex items-center gap-3 border-b border-teal-100 bg-white hover:bg-teal-50 text-right w-full"
                  >
                    <Avatar
                      title={active.title}
                      group={active.type === "GROUP"}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-black text-sm truncate">
                        {active.title}
                      </p>
                      <p className="text-teal-800 text-[11px] font-bold">
                        {active.type === "GROUP"
                          ? `${active.members?.length || 0} عضو · کلیک برای دیدن اسامی`
                          : "گفتگوی خصوصی"}
                      </p>
                    </div>
                    <span className="text-teal-700 text-xs font-black">
                      {showMembers ? "بستن" : "اعضا"}
                    </span>
                  </button>

                  {showMembers && (
                    <div className="border-b border-teal-100 bg-teal-50 max-h-52 overflow-y-auto">
                      <p className="px-4 py-2 text-xs font-black text-teal-900">
                        اعضای «{active.title}»
                      </p>
                      {(active.members || []).map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-2 border-t border-teal-100"
                        >
                          <Avatar title={m.displayName} size={34} />
                          <div>
                            <p className="text-sm font-black text-slate-900">
                              {m.displayName}
                            </p>
                            <p className="text-[11px] text-teal-800 font-bold">
                              {m.stationName || ROLE_FA[m.role] || m.role}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                    {loadingMsgs && (
                      <p className="text-teal-800 text-xs text-center font-bold">
                        بارگذاری پیام‌ها...
                      </p>
                    )}
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.isMine ? "justify-start" : "justify-end"
                        }`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                            m.deleted
                              ? "bg-slate-200 text-slate-500 italic"
                              : m.isMine
                              ? "bg-teal-600 text-white rounded-br-md"
                              : "bg-white text-slate-900 border border-teal-100 rounded-bl-md"
                          }`}
                        >
                          {!m.isMine && !m.deleted && (
                            <p className="text-[11px] font-black text-teal-700 mb-1">
                              {m.sender.displayName}
                            </p>
                          )}

                          {editingId === m.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full rounded-lg border border-teal-200 text-slate-900 text-sm p-2"
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={saveEdit}
                                  className="text-xs font-black bg-white text-teal-800 px-2 py-1 rounded"
                                >
                                  ذخیره
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="text-xs font-bold opacity-80"
                                >
                                  انصراف
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {m.attachmentUrl && !m.deleted && (
                                <div className="mb-2">
                                  {m.attachmentType === "image" ? (
                                    <a
                                      href={m.attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img
                                        src={m.attachmentUrl}
                                        alt={m.attachmentName || "تصویر"}
                                        className="max-w-full max-h-56 rounded-lg border border-white/20"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={m.attachmentUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`inline-flex items-center gap-2 text-xs font-black underline ${
                                        m.isMine ? "text-teal-50" : "text-teal-800"
                                      }`}
                                    >
                                      📎 {m.attachmentName || "دانلود فایل"}
                                    </a>
                                  )}
                                </div>
                              )}
                              <p className="leading-relaxed whitespace-pre-wrap font-medium">
                                {m.deleted ? "[پیام حذف‌شده]" : m.body}
                              </p>
                            </>
                          )}

                          {m.orderNumber && !m.deleted && (
                            <p
                              className={`text-[11px] mt-1 font-black ${
                                m.isMine ? "text-amber-100" : "text-amber-700"
                              }`}
                            >
                              سفارش {m.orderNumber}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 mt-1.5 justify-end">
                            {m.editedAt && !m.deleted && (
                              <span
                                className={`text-[10px] ${
                                  m.isMine ? "text-teal-100" : "text-slate-500"
                                }`}
                              >
                                ویرایش‌شده
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold ${
                                m.isMine ? "text-teal-100" : "text-teal-700"
                              }`}
                            >
                              {formatDateTime(m.createdAt)}
                            </span>
                            {m.isMine && !m.deleted && editingId !== m.id && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(m.id)
                                    setEditText(m.body || "")
                                  }}
                                  className="text-[10px] font-black text-teal-50 hover:text-white"
                                >
                                  ویرایش
                                </button>
                                <button
                                  type="button"
                                  onClick={() => softDelete(m.id)}
                                  className="text-[10px] font-black text-teal-50 hover:text-red-200"
                                >
                                  حذف
                                </button>
                              </>
                            )}
                          </div>

                          {m.isMine &&
                            !m.deleted &&
                            m.readBy &&
                            m.readBy.length > 0 && (
                              <p className="text-[10px] text-teal-100 mt-1 text-left leading-4">
                                دیده شده: {m.readBy.slice(0, 5).join("، ")}
                                {m.readBy.length > 5
                                  ? ` و ${m.readBy.length - 5} نفر دیگر`
                                  : ""}
                              </p>
                            )}
                        </div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>

                  {/* ورودی */}
                  <div className="p-3 bg-white border-t-2 border-teal-100">
                    {pendingFile && (
                      <div className="mb-2 flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-3 py-2">
                        <span className="text-xs font-bold text-teal-900 flex-1 truncate">
                          📎 {pendingFile.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingFile(null)}
                          className="text-xs font-black text-red-600"
                        >
                          حذف فایل
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                        placeholder="شماره سفارش (اختیاری)"
                        className="rounded-lg border-2 border-teal-200 text-sm font-semibold text-slate-900 px-3 py-2 outline-none w-44 focus:border-teal-500 placeholder:text-slate-400"
                        dir="ltr"
                      />
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) uploadFile(f)
                          e.target.value = ""
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="rounded-lg border-2 border-teal-300 text-teal-800 text-xs font-black px-3 py-2 hover:bg-teal-50 disabled:opacity-50"
                      >
                        {uploading ? "آپلود..." : "عکس / PDF"}
                      </button>
                    </div>
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={inputRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            send()
                          }
                        }}
                        rows={2}
                        placeholder="پیام خود را بنویسید..."
                        className="flex-1 resize-none rounded-2xl border-2 border-teal-300 text-sm font-semibold text-slate-900 px-4 py-3 outline-none focus:border-teal-500 placeholder:text-slate-500 max-h-36 bg-white"
                      />
                      <button
                        type="button"
                        onClick={send}
                        disabled={
                          sending || (!text.trim() && !pendingFile)
                        }
                        className="rounded-full bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white w-12 h-12 flex items-center justify-center shrink-0 shadow-lg"
                      >
                        <svg
                          className="w-5 h-5 rotate-180"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}