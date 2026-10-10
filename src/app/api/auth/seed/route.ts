import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"

const USERS: {
  username: string
  displayName: string
  role: string
  stationName: string | null
}[] = [
  // فروش
  { username: "حسینی", displayName: "خانم حسینی", role: "sales", stationName: null },
  { username: "قنبرنژاد", displayName: "خانم قنبرنژاد", role: "sales", stationName: null },
  { username: "عباس زاده", displayName: "مائده عباس‌زاده", role: "designer", stationName: null },
  // مالی و مدیریت
  { username: "فرحی", displayName: "خانم فرحی", role: "finance", stationName: null },
  { username: "مجتبی خاجی", displayName: "مجتبی خاجی", role: "admin", stationName: null },
  // تولید
  { username: "برش", displayName: "برش", role: "production", stationName: "برش" },
  { username: "تراش 1", displayName: "تراش ۱", role: "production", stationName: "تراش ۱" },
  { username: "تراش 2", displayName: "تراش ۲", role: "production", stationName: "تراش ۲" },
  { username: "تراش الگویی", displayName: "تراش الگویی", role: "production", stationName: "تراش الگویی" },
  { username: "دیاموند", displayName: "دیاموند", role: "production", stationName: "دیاموند" },
  { username: "دیاموند زاویه", displayName: "دیاموند زاویه", role: "production", stationName: "دیاموند زاویه" },
  // لول معمولی + براق → یک یوزر / ایستگاه
  { username: "لول", displayName: "لول", role: "production", stationName: "لول" },
  { username: "لیمینت", displayName: "لیمینت", role: "production", stationName: "لیمینت" },
  { username: "دوجداره", displayName: "دوجداره", role: "production", stationName: "دوجداره" },
  { username: "cnc", displayName: "CNC", role: "production", stationName: "CNC" },
  { username: "جاساز", displayName: "جاساز", role: "production", stationName: "جاساز" },
  { username: "uv", displayName: "UV", role: "production", stationName: "UV" },
  { username: "led", displayName: "LED", role: "production", stationName: "LED" },
  { username: "mdf", displayName: "MDF", role: "production", stationName: "MDF" },
  { username: "سوراخکاری", displayName: "سوراخکاری", role: "production", stationName: "سوراخکاری" },
  { username: "سندبلاست", displayName: "سندبلاست", role: "production", stationName: "سندبلاست" },
  { username: "چاپ", displayName: "چاپ (رنگ‌کاری)", role: "production", stationName: "چاپ (رنگ‌کاری)" },
  { username: "قاب", displayName: "قاب", role: "production", stationName: "قاب" },
  { username: "خم کاری", displayName: "خم‌کاری", role: "production", stationName: "خم‌کاری" },
  { username: "سکوریت", displayName: "سکوریت", role: "production", stationName: "سکوریت" },
  { username: "شست و شو", displayName: "شست و شو", role: "production", stationName: "شست و شو" },
  { username: "بسته بندی", displayName: "بسته‌بندی", role: "production", stationName: "بسته‌بندی" },
  {
    username: "انبار نیمه ساخته",
    displayName: "انبار کالای نیمه‌ساخته",
    role: "production",
    stationName: "انبار کالای نیمه‌ساخته",
  },
  {
    username: "انبار آماده تحویل",
    displayName: "انبار آماده تحویل",
    role: "production",
    stationName: "انبار آماده تحویل",
  },
  { username: "بارگیری", displayName: "بارگیری", role: "production", stationName: "بارگیری" },
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
      message: "کاربران فارسی ساخته/بروز شدند. رمز همه: 123456",
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