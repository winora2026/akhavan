import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"

const USERS = [
  // فروش
  { username: "hoseini", displayName: "خانم حسینی", role: "sales", stationName: null },
  { username: "ghanbarnejad", displayName: "خانم قنبرنژاد", role: "sales", stationName: null },
  { username: "design", displayName: "کاربر فروش", role: "sales", stationName: null },
  // مالی و مدیریت
  { username: "farahi", displayName: "خانم فرحی", role: "finance", stationName: null },
  { username: "modir", displayName: "مدیریت", role: "admin", stationName: null },
  // ایستگاه‌های تولید
  { username: "boresh", displayName: "برش", role: "production", stationName: "برش" },
  { username: "tarash", displayName: "تراش", role: "production", stationName: "تراش" },
  { username: "tarash_olgo", displayName: "تراش الگویی", role: "production", stationName: "تراش الگویی" },
  { username: "diamond", displayName: "دیاموند", role: "production", stationName: "دیاموند" },
  { username: "diamond_zavie", displayName: "دیاموند زاویه", role: "production", stationName: "دیاموند زاویه" },
  { username: "lole_mamoli", displayName: "لول معمولی", role: "production", stationName: "لول معمولی" },
  { username: "lole_baraq", displayName: "لول براق", role: "production", stationName: "لول براق" },
  { username: "laminate", displayName: "لیمینت", role: "production", stationName: "لیمینت" },
  { username: "dojodare", displayName: "دوجداره", role: "production", stationName: "دوجداره" },
  { username: "cnc", displayName: "CNC", role: "production", stationName: "CNC" },
  { username: "led", displayName: "LED", role: "production", stationName: "LED" },
  { username: "mdf", displayName: "MDF", role: "production", stationName: "MDF" },
  { username: "anbar1", displayName: "انبار محصول یک", role: "production", stationName: "انبار محصول یک" },
  { username: "anbar2", displayName: "انبار محصول دو", role: "production", stationName: "انبار محصول دو" },
  { username: "barigiri", displayName: "بارگیری", role: "production", stationName: "بارگیری" },
  { username: "bastebandi", displayName: "بسته‌بندی", role: "production", stationName: "بسته‌بندی" },
  { username: "shostosho", displayName: "شست و شو", role: "production", stationName: "شست و شو" },
  { username: "chap", displayName: "چاپ", role: "production", stationName: "چاپ" },
  { username: "sandblast", displayName: "سندبلاست", role: "production", stationName: "سندبلاست" },
  { username: "sorakh", displayName: "سوراخکاری", role: "production", stationName: "سوراخکاری" },
  { username: "sikurit", displayName: "سکوریت", role: "production", stationName: "سکوریت" },
]

export async function GET() {
  try {
    const passwordHash = await hashPassword("123456")
    const created = []

    for (const u of USERS) {
      const user = await prisma.user.upsert({
        where: { username: u.username },
        update: {
          displayName: u.displayName,
          role: u.role,
          stationName: u.stationName,
          passwordHash,
          isActive: true,
        },
        create: {
          username: u.username,
          displayName: u.displayName,
          role: u.role,
          stationName: u.stationName,
          passwordHash,
        },
      })
      created.push({
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        stationName: user.stationName,
      })
    }

    return NextResponse.json({
      message: "کاربران ساخته/بروز شدند. رمز همه: 123456",
      users: created,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
      { error: e.message || "خطا در seed" },
      { status: 500 }
    )
  }
}