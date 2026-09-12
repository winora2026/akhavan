import { Suspense } from "react"
import NewOrderClient from "./NewOrderClient"

export const dynamic = "force-dynamic"

export default function NewOrderPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          dir="rtl"
        >
          <p className="text-lg font-bold text-blue-800">در حال بارگذاری...</p>
        </div>
      }
    >
      <NewOrderClient />
    </Suspense>
  )
}