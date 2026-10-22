import { Suspense } from "react"
import FollowUpsClient from "./FollowUpsClient"

export default function FollowUpsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center font-bold text-blue-900"
          dir="rtl"
        >
          در حال بارگذاری کارتابل پیگیری...
        </div>
      }
    >
      <FollowUpsClient />
    </Suspense>
  )
}