import fs from "fs"
import path from "path"
import { telephonyConfig } from "./config"

export function resolveRecordingPath(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null
  const root = path.resolve(telephonyConfig.recordingsDir)
  const full = path.resolve(root, relativePath)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}

export function recordingExists(relativePath: string | null | undefined): boolean {
  const full = resolveRecordingPath(relativePath)
  if (!full) return false
  try {
    return fs.statSync(full).isFile()
  } catch {
    return false
  }
}
