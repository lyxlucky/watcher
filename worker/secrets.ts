import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = Buffer.from(process.env.CHANNEL_SECRET_KEY ?? "", "base64");
  if (value.length !== 32) throw new Error("CHANNEL_SECRET_KEY 必须是 32 字节的 Base64 密钥");
  return value;
}

export function seal(target: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const data = Buffer.concat([cipher.update(target, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString("base64");
}

export function unseal(value: string) {
  const data = Buffer.from(value, "base64");
  const cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}
