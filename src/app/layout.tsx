import type { Metadata } from "next"
import "./globals.css"

import "@fontsource/vazirmatn/400.css"
import "@fontsource/vazirmatn/500.css"
import "@fontsource/vazirmatn/600.css"
import "@fontsource/vazirmatn/700.css"
import "@fontsource/vazirmatn/800.css"

import AppTabs from "@/components/AppTabs"

export const metadata: Metadata = {
  title: "اخوان | نرم‌افزار شیشه و آینه",
  description: "نرم‌افزار مدیریت فروش و تولید شیشه و آینه اخوان",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif",
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          backgroundImage:
            "url('https://i.postimg.cc/k4QL4Dsd/1F9CD217-645E-43FC-8039-84DC1134B6DA.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          backgroundColor: "#0f172a",
        }}
      >
        <AppTabs />
        {children}
      </body>
    </html>
  )
}