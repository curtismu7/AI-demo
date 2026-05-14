import axios from "axios";
import { getEnv, pingOneAuthBaseUrl, pingOneBaseUrl, requireEnv } from "./env";

interface WorkerToken {
  access_token: string;
  expires_at: number;
}

let cached: WorkerToken | null = null;

async function fetchWorkerToken(): Promise<WorkerToken> {
  const clientId =
    getEnv("PINGONE_WORKER_CLIENT_ID") ??
    getEnv("PINGONE_MANAGEMENT_CLIENT_ID") ??
    requireEnv("PINGONE_ADMIN_CLIENT_ID");
  const clientSecret =
    getEnv("PINGONE_WORKER_CLIENT_SECRET") ??
    getEnv("PINGONE_MANAGEMENT_CLIENT_SECRET") ??
    requireEnv("PINGONE_ADMIN_CLIENT_SECRET");
  const tokenUrl = `${pingOneAuthBaseUrl()}/token`;

  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");

  const res = await axios.post<{ access_token: string; expires_in: number }>(
    tokenUrl,
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      timeout: 10_000,
    }
  );
  return {
    access_token: res.data.access_token,
    expires_at: Date.now() + (res.data.expires_in - 30) * 1000,
  };
}

export async function getWorkerToken(): Promise<string> {
  if (cached && cached.expires_at > Date.now()) return cached.access_token;
  cached = await fetchWorkerToken();
  return cached.access_token;
}

export async function pingOneGet<T>(pathSegment: string): Promise<T> {
  const token = await getWorkerToken();
  const url = pathSegment.startsWith("http")
    ? pathSegment
    : `${pingOneBaseUrl()}${pathSegment}`;
  const res = await axios.get<T>(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  return res.data;
}

export async function pingOnePatch<T>(
  pathSegment: string,
  body: unknown
): Promise<T> {
  const token = await getWorkerToken();
  const url = `${pingOneBaseUrl()}${pathSegment}`;
  const res = await axios.patch<T>(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 15_000,
  });
  return res.data;
}

export async function introspectToken(token: string): Promise<Record<string, unknown>> {
  const clientId = requireEnv("PINGONE_ADMIN_CLIENT_ID");
  const clientSecret = requireEnv("PINGONE_ADMIN_CLIENT_SECRET");
  const url = `${pingOneAuthBaseUrl()}/introspect`;
  const body = new URLSearchParams();
  body.set("token", token);
  body.set("token_type_hint", "access_token");
  const res = await axios.post<Record<string, unknown>>(url, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    timeout: 15_000,
  });
  return res.data;
}
