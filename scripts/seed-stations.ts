import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const stations = [
  "برش",
  "تراش",
  "تراش الگویی",
  "دیاموند",
  "دیاموند زاویه",
  "لول معمولی",
  "لول براق",
  "لیمینت",
  "دوجداره",
  "CNC",
  "LED",
  "MDF",
  "انبار محصول یک",
  "انبار محصول دو",
  "بارگیری",
  "بسته بندی",
  "شست و شو",
  "چاپ",
  "سندبلاست",
  "سوراخکاری",
  "سکوریت",
]

async function main() {
  for (let i = 0; i < stations.length; i++) {
    const name = stations[i]
    const code = `ST-${i + 1}`

    const existing = await prisma.productionStation.findFirst({
      where: { name },
    })

    if (existing) {
      await prisma.productionStation.update({
        where: { id: existing.id },
        data: {
          sortOrder: i + 1,
          isActive: true,
          code,
        },
      })
    } else {
      await prisma.productionStation.create({
        data: {
          name,
          code,
          sortOrder: i + 1,
          isActive: true,
        },
      })
    }
  }
  console.log("Stations seeded:", stations.length)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })