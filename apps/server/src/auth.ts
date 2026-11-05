import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { persistence } from "./db.js";

const scryptAsync = promisify(scrypt);

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hash, "hex"), derived);
}

export async function register(username: string, password: string): Promise<{ ok: boolean; token?: string; accountId?: string; error?: string }> {
  const existing = await persistence.getAccountByUsername(username);
  if (existing) {
    return { ok: false, error: "用户名已存在" };
  }
  const accountId = randomUUID();
  const passwordHash = await hashPassword(password);
  await persistence.createAccount(accountId, username, passwordHash);

  const token = randomUUID();
  await persistence.saveAuthToken(tokenHash(token), accountId, Date.now() + TOKEN_EXPIRY_MS);
  return { ok: true, token, accountId };
}

export async function login(username: string, password: string): Promise<{ ok: boolean; token?: string; accountId?: string; error?: string }> {
  const account = await persistence.getAccountByUsername(username);
  if (!account) {
    return { ok: false, error: "用户名不存在" };
  }
  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) {
    return { ok: false, error: "密码错误" };
  }
  const token = randomUUID();
  await persistence.saveAuthToken(tokenHash(token), account.accountId, Date.now() + TOKEN_EXPIRY_MS);
  return { ok: true, token, accountId: account.accountId };
}

export async function verifyToken(token: string): Promise<{ accountId: string; characterId?: string } | null> {
  if (!token) return null;
  const entry = await persistence.getAuthToken(tokenHash(token));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    await persistence.deleteAuthToken(tokenHash(token));
    return null;
  }
  return { accountId: entry.accountId, characterId: entry.characterId ?? undefined };
}

export async function setTokenCharacter(token: string, characterId: string): Promise<void> {
  await persistence.setAuthTokenCharacter(tokenHash(token), characterId);
}
