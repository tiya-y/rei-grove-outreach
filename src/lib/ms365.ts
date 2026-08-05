// ============================================================
// Microsoft Graph client — connects one Outlook/M365 mailbox so the app can
// send the initial outreach email AND monitor the resulting thread (replies
// landing in Inbox, and anything sent from Sent Items) without anyone having
// to forward or CC the app.
//
// OAuth: standard delegated auth-code flow (MSAL-free — just raw Graph REST
// calls, matching the pattern already used in PO-outreach-app's ms365.ts,
// extended here with Mail.Read/Mail.ReadWrite so we can list + read threads,
// not just book calendar events).
// ============================================================

import axios from 'axios';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Mail.Send Mail.Read Mail.ReadWrite User.Read offline_access';

function graphClient(accessToken: string) {
  return axios.create({
    baseURL: GRAPH_BASE,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

function tenantPath() {
  // MS365_TENANT_ID can be a real tenant GUID, or "common"/"organizations" for
  // multi-tenant app registrations.
  return process.env.MS365_TENANT_ID || 'common';
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export function getAuthorizationUrl(state?: string) {
  const params = new URLSearchParams({
    client_id: process.env.MS365_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MS365_REDIRECT_URI!,
    scope: SCOPES,
    response_mode: 'query',
    ...(state ? { state } : {}),
  });
  return `https://login.microsoftonline.com/${tenantPath()}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantPath()}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MS365_CLIENT_ID!,
      client_secret: process.env.MS365_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MS365_REDIRECT_URI!,
      grant_type: 'authorization_code',
      scope: SCOPES,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await axios.post(
    `https://login.microsoftonline.com/${tenantPath()}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.MS365_CLIENT_ID!,
      client_secret: process.env.MS365_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function getMyProfile(accessToken: string) {
  const client = graphClient(accessToken);
  const res = await client.get('/me?$select=id,displayName,mail,userPrincipalName');
  return res.data;
}

// ── Sending ──────────────────────────────────────────────────────────────────

export async function sendMailViaGraph(
  accessToken: string,
  params: {
    toEmail: string;
    toName?: string;
    subject: string;
    bodyHtml: string;
    /** Set when replying within an existing thread, otherwise omit for a new thread. */
    conversationId?: string;
  }
) {
  const client = graphClient(accessToken);
  await client.post('/me/sendMail', {
    message: {
      subject: params.subject,
      body: { contentType: 'HTML', content: params.bodyHtml },
      toRecipients: [{ emailAddress: { address: params.toEmail, name: params.toName ?? params.toEmail } }],
    },
    saveToSentItems: true,
  });

  // Graph's sendMail doesn't return the created message, so look it up in
  // Sent Items right after so we can capture its id + conversationId for
  // thread tracking.
  const sent = await client.get(
    `/me/mailFolders/SentItems/messages?$orderby=sentDateTime desc&$top=5&$select=id,conversationId,subject,toRecipients,sentDateTime`
  );
  const match = (sent.data.value as GraphMessage[]).find(
    (m) => m.subject === params.subject && m.toRecipients?.some((r) => r.emailAddress.address.toLowerCase() === params.toEmail.toLowerCase())
  );
  return match ?? null;
}

// ── Reading / thread monitoring ─────────────────────────────────────────────

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: { emailAddress: { address: string; name?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
}

/**
 * Lists messages in Inbox + Sent Items received/sent since `sinceIso`,
 * across all folders relevant to prospect threads. Used by /api/graph/sync,
 * which n8n (or Vercel Cron) calls on a schedule.
 */
export async function listRecentMessages(accessToken: string, sinceIso: string): Promise<GraphMessage[]> {
  const client = graphClient(accessToken);
  const select = 'id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,isRead';

  const [inbox, sent] = await Promise.all([
    client.get(`/me/mailFolders/Inbox/messages`, {
      params: {
        $filter: `receivedDateTime ge ${sinceIso}`,
        $orderby: 'receivedDateTime desc',
        $top: 50,
        $select: select,
      },
    }),
    client.get(`/me/mailFolders/SentItems/messages`, {
      params: {
        $filter: `sentDateTime ge ${sinceIso}`,
        $orderby: 'sentDateTime desc',
        $top: 50,
        $select: select,
      },
    }),
  ]);

  return [...(inbox.data.value ?? []), ...(sent.data.value ?? [])];
}

/** Fetches every message in a given conversation (used to render the thread view). */
export async function getConversationMessages(accessToken: string, conversationId: string): Promise<GraphMessage[]> {
  const client = graphClient(accessToken);
  const res = await client.get('/me/messages', {
    params: {
      $filter: `conversationId eq '${conversationId}'`,
      $orderby: 'receivedDateTime asc',
      $top: 50,
      $select: 'id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,isRead',
    },
  });
  return res.data.value ?? [];
}
