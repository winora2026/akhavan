import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"

const COOKIE_NAME = "akhavan_session"
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "akhavan-secret-change-me-in-production-32chars"
)

export type SessionUser = {
  id: string
  username: string
  displayName: string
  role: string
  stationName?: string | null
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    stationName: user.stationName ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET)
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return {
      id: String(payload.id),
      username: String(payload.username),
      displayName: String(payload.displayName),
      role: String(payload.role),
      stationName: payload.stationName ? String(payload.stationName) : null,
    }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export { COOKIE_NAME }