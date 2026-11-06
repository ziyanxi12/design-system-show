/**
 * X-User-Data 加密（与 lib-resource-ui 同协议）：
 * AES-256-CBC（密钥来自 VITE_AUTH_AES_KEY，与后端 AUTH_AES_KEY 一致），
 * 输出 Base64( IV(16) + 密文 )，随请求头发送，后端 AuthMiddleware 解密得操作人。
 */
const AES_KEY = import.meta.env.VITE_AUTH_AES_KEY ?? ""

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = base64ToBytes(AES_KEY)
  cachedKey = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "AES-CBC" }, false, ["encrypt"])
  return cachedKey
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function encryptUserData(data: Record<string, unknown>): Promise<string> {
  if (!AES_KEY) return ""
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const encoded = new TextEncoder().encode(JSON.stringify(data))
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, encoded)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return bytesToBase64(combined)
}
