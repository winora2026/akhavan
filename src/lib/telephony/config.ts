export const telephonyConfig = {
  enabled: process.env.TELEPHONY_ENABLED === "true",
  ami: {
    host: process.env.AMI_HOST || "127.0.0.1",
    port: Number(process.env.AMI_PORT || 15038),
    username: process.env.AMI_USER || "crm",
    secret: process.env.AMI_SECRET || "",
  },
  mysql: {
    host: process.env.PBX_MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.PBX_MYSQL_PORT || 13306),
    user: process.env.PBX_MYSQL_USER || "crm_ro",
    password: process.env.PBX_MYSQL_PASSWORD || "",
    database: process.env.PBX_MYSQL_DATABASE || "asteriskcdrdb",
  },
  recordingsDir: process.env.RECORDINGS_DIR || "/home/amb/akhavan-recordings",
  backfillDays: Number(process.env.TELEPHONY_BACKFILL_DAYS || 30),
  ringExtensions: (process.env.TELEPHONY_RING_EXTENSIONS || "103,104,105,106")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
}

export const TEHRAN_OFFSET = "+03:30"
export const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000
