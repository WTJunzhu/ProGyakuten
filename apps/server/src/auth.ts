import { randomUUID, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { persistence } from "./db.js";

const scryptAsync = promisify(scrypt);

// In-memory token store: token → { accountId, characterId? }
const tokens = new Map<string, { accountId: string; characterId?: string }>();

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const tokenTimestamps = new Map<string, number>();

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
  tokens.set(token, { accountId });
  tokenTimestamps.set(token, Date.now());
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
  tokens.set(token, { accountId: account.accountId });
  tokenTimestamps.set(token, Date.now());
  return { ok: true, token, accountId: account.accountId };
}

export function verifyToken(token: string): { accountId: string; characterId?: string } | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  const ts = tokenTimestamps.get(token);
  if (ts && Date.now() - ts > TOKEN_EXPIRY_MS) {
    tokens.delete(token);
    tokenTimestamps.delete(token);
    return null;
  }
  return entry;
}

export function setTokenCharacter(token: string, characterId: string): void {
  const entry = tokens.get(token);
  if (entry) {
    entry.characterId = characterId;
  }
}

export function getTokenCharacter(token: string): string | undefined {
  return tokens.get(token)?.characterId;
}

export function deleteToken(token: string): void {
  tokens.delete(token);
  tokenTimestamps.delete(token);
}
