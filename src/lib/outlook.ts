// ============================================================
// Per-person Outlook (Microsoft 365) connection. Each teammate signs in once
// with their own Microsoft account; the app then saves outreach emails into
// THAT person's Outlook Drafts folder. It never sends anything and never
// reads the inbox: the only Graph calls in this app are the sign-in profile
// lookup and "create a draft message".
//
// How "who is using the app" works: the app has no user accounts, so signing
// in with Microsoft sets a signed cookie (the Microsoft account id and email).
// Each person's refresh token is stored encrypted in the database under that
// account id. This identifies the person for drafting only. It does not gate
// the rest of the app (see README "Security notes").
//
// Setup (Microsoft Entra app registration, delegated permissions):
//   Mail.ReadWrite  create drafts in the signed-in user's mailbox
//   User.Read       identify who signed in
//   offline_access  keep the connection without signing in every hour
// Mail.ReadWrite is the narrowest scope Microsoft offers for creating drafts;
// it technically also allows reading, but this app only ever calls
// POST /me/messages.
// ============================================================

import axios from 'axios';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { sql } from './db';
import { ensureOutlookSchema } from './schema';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
export const SCOPES = 'Mail.ReadWrite User.Read offline_access';
export const CALLBACK_PATH = '/api/auth/microsoft/callback';
export const SESSION_COOKIE = 'rg_session';
export const OAUTH_COOKIE = 'rg_oauth';
const SESSION_DAYS = 30;
// Refresh the access token a little before it actually expires.
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

// ── Configuration ───────────────────────────────────────────────────────────

const REQUIRED_ENV = ['MS365_TENANT_ID', 'MS365_CLIENT_ID', 'MS365_CLIENT_SECRET', 'SESSION_SECRET'] as const;

export function missingOutlookEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

export function isOutlookConfigured(): boolean {
  return missingOutlookEnv().length === 0;
}

function tenant(): string {
  return process.env.MS365_TENANT_ID as string;
}

/** Optional comma-separated allow-list of emails that may connect. Empty means any account in the tenant. */
export function isEmailAllowed(email: string): boolean {
  const list = (process.env.MS365_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email.toLowerCase());
}

/**
 * The redirect URI must match what is registered in Entra exactly. It is the
 * address the person is actually browsing, so the session cookie set at the
 * callback lands on the same host. MS365_REDIRECT_URI overrides it.
 */
export function redirectUri(origin: string): string {
  return process.env.MS365_REDIRECT_URI || `${origin}${CALLBACK_PATH}`;
}

/** The public origin of this request, honoring the proxy headers Vercel sets. */
export function originFromHeaders(headers: Headers, fallbackUrl: string): string {
  const url = new URL(fallbackUrl);
  const proto = headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  const host = headers.get('x-forwarded-host')?.split(',')[0].trim() || headers.get('host') || url.host;
  return `${proto}://${host}`;
}

// ── Crypto: signed session cookie and encrypted tokens ──────────────────────

function subkey(label: string): Buffer {
  return createHmac('sha256', process.env.SESSION_SECRET as string).update(label).digest();
}

export interface Session {
  uid: string;
  email: string;
}

export function signSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + SESSION_DAYS * 86400000 })).toString('base64url');
  const sig = createHmac('sha256', subkey('session')).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readSession(raw: string | null | undefined): Session | null {
  if (!raw || !process.env.SESSION_SECRET) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', subkey('session')).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.uid !== 'string' || typeof data.email !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { uid: data.uid, email: data.email };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  };
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey('tokens'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decrypt(blob: string): string {
  const [version, iv, tag, data] = blob.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognized token format.');
  const decipher = createDecipheriv('aes-256-gcm', subkey('tokens'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// ── OAuth ───────────────────────────────────────────────────────────────────

export function authorizationUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MS365_CLIENT_ID as string,
    response_type: 'code',
    redirect_uri: redirectUri(origin),
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MS365_CLIENT_ID as string,
      client_secret: process.env.MS365_CLIENT_SECRET as string,
      scope: SCOPES,
      ...body,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return res.data as TokenResponse;
}

export function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(origin) });
}

export function describeMicrosoftError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    const msg = data?.error_description ?? data?.error?.message ?? (typeof data?.error === 'string' ? data.error : null);
    if (msg) return String(msg).split('\r\n')[0].replace(/\s*Trace ID:[\s\S]*$/, '').slice(0, 300);
    return err.message;
  }
  return err instanceof Error ? err.message : 'Microsoft request failed';
}

/** The person must sign in with Microsoft again. */
export class OutlookReconnectError extends Error {
  constructor(message = 'Your Outlook connection has expired or was revoked. Reconnect it in Settings.') {
    super(message);
  }
}

// ── Stored connections ──────────────────────────────────────────────────────

export interface Connection {
  ms_user_id: string;
  email: string;
  display_name: string | null;
}

export async function saveConnection(
  profile: { id: string; email: string; displayName: string | null },
  tokens: { access_token: string; refresh_token: string; expires_in: number }
): Promise<void> {
  await ensureOutlookSchema();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await sql`
    insert into outlook_connections (ms_user_id, email, display_name, access_token_enc, refresh_token_enc, expires_at)
    values (${profile.id}, ${profile.email}, ${profile.displayName}, ${encrypt(tokens.access_token)}, ${encrypt(tokens.refresh_token)}, ${expiresAt})
    on conflict (ms_user_id) do update set
      email = excluded.email,
      display_name = excluded.display_name,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      expires_at = excluded.expires_at,
      updated_at = now()
  `;
}

export async function getConnection(uid: string): Promise<Connection | null> {
  await ensureOutlookSchema();
  const [row] = await sql`select ms_user_id, email, display_name from outlook_connections where ms_user_id = ${uid}`;
  return (row as Connection | undefined) ?? null;
}

export async function deleteConnection(uid: string): Promise<void> {
  await ensureOutlookSchema();
  await sql`delete from outlook_connections where ms_user_id = ${uid}`;
}

/** A valid access token for this person, refreshing (and storing the rotated refresh token) when needed. */
export async function getAccessToken(uid: string): Promise<string> {
  await ensureOutlookSchema();
  const [row] = await sql`select access_token_enc, refresh_token_enc, expires_at from outlook_connections where ms_user_id = ${uid}`;
  if (!row) throw new OutlookReconnectError('Outlook is not connected for this browser. Connect it first.');

  try {
    if (row.expires_at && new Date(row.expires_at).getTime() - Date.now() > EXPIRY_SKEW_MS) {
      return decrypt(row.access_token_enc);
    }
  } catch {
    // Unreadable (for example SESSION_SECRET changed): fall through to the refresh path, which will also fail and ask to reconnect.
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(row.refresh_token_enc);
  } catch {
    await deleteConnection(uid);
    throw new OutlookReconnectError();
  }

  try {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await sql`
      update outlook_connections
      set access_token_enc = ${encrypt(tokens.access_token)},
          refresh_token_enc = ${encrypt(tokens.refresh_token ?? refreshToken)},
          expires_at = ${expiresAt}, updated_at = now()
      where ms_user_id = ${uid}
    `;
    return tokens.access_token;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && err.response.status >= 400 && err.response.status < 500) {
      await deleteConnection(uid);
      throw new OutlookReconnectError(`Outlook refused the saved sign-in (${describeMicrosoftError(err)}). Reconnect it in Settings.`);
    }
    throw new Error(`Could not reach Microsoft to refresh the connection: ${describeMicrosoftError(err)}`);
  }
}

// ── Graph ───────────────────────────────────────────────────────────────────

export async function getProfile(accessToken: string): Promise<{ id: string; email: string; displayName: string | null }> {
  const res = await axios.get(`${GRAPH_BASE}/me`, {
    params: { $select: 'id,displayName,mail,userPrincipalName' },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  const email = res.data.mail || res.data.userPrincipalName;
  if (!res.data.id || !email) throw new Error('Microsoft did not return an account id and email for this sign-in.');
  return { id: res.data.id, email, displayName: res.data.displayName ?? null };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Plain text to Outlook-friendly HTML: escapes everything, turns line breaks
 * into <br>, and makes each URL a link whose visible text is the full,
 * unmodified URL (links are never shortened or rewritten).
 */
export function textToHtml(text: string): string {
  const urlRe = /https?:\/\/[^\s<>"]+/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    const trailing = (m[0].match(/[.,;:!?)\]]+$/) ?? [''])[0];
    const url = m[0].slice(0, m[0].length - trailing.length);
    out += escapeHtml(text.slice(last, m.index)) + `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` + escapeHtml(trailing);
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${out.replace(/\r?\n/g, '<br>')}</div>`;
}

/** Saves a message into the signed-in user's Drafts folder. Does not send it. */
export async function createDraft(
  accessToken: string,
  params: { toEmail: string; toName?: string | null; subject: string; bodyText: string }
): Promise<{ id: string; webLink: string | null }> {
  try {
    const res = await axios.post(
      `${GRAPH_BASE}/me/messages`,
      {
        subject: params.subject.replace(/[\r\n]+/g, ' ').trim(),
        body: { contentType: 'HTML', content: textToHtml(params.bodyText) },
        toRecipients: [{ emailAddress: { address: params.toEmail, name: params.toName || params.toEmail } }],
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    return { id: res.data.id, webLink: res.data.webLink ?? null };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) throw new OutlookReconnectError();
    if (axios.isAxiosError(err) && err.response?.status === 403) {
      throw new Error(`Microsoft denied creating a draft: ${describeMicrosoftError(err)}. The app registration needs the Mail.ReadWrite permission (and admin consent if your organization requires it).`);
    }
    throw new Error(`Could not create the Outlook draft: ${describeMicrosoftError(err)}`);
  }
}
