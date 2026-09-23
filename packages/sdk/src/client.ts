const DEFAULT_BASE_URL = "http://localhost:4000";

export interface ClientOptions {
  baseUrl?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  timeout?: number;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, QueryValue>;
  raw?: boolean;
  timeout?: number;
}

export class SanctumApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = "SanctumApiError";
  }
}

export class SanctumClient {
  baseUrl: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  timeout: number;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.timeout = options.timeout ?? 30000;
  }

  setToken(token: string): void {
    this.accessToken = token;
  }

  clearToken(): void {
    this.accessToken = undefined;
  }

  buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    let url = `${this.baseUrl}${normalized}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        params.append(key, String(value));
      }
      const queryString = params.toString();
      if (queryString) url += `?${queryString}`;
    }
    return url;
  }

  private buildHeaders(init?: Record<string, string>): Headers {
    const headers = new Headers(init);
    headers.set("Accept", "application/json");
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }
    return headers;
  }

  private prepareBody(body: unknown): { body: unknown; headers: Headers } {
    if (
      body instanceof FormData ||
      body instanceof Blob ||
      body instanceof URLSearchParams ||
      typeof body === "string"
    ) {
      return { body, headers: this.buildHeaders() };
    }

    const headers = this.buildHeaders({ "Content-Type": "application/json" });
    return { body: JSON.stringify(body), headers };
  }

  async requestRaw(path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const controller = new AbortController();
    const timeout = options.timeout ?? this.timeout;
    const timer = setTimeout(() => controller.abort(), timeout);

    const init: { method: string; headers: Headers; body?: unknown; signal?: AbortSignal } = {
      method: options.method ?? "GET",
      headers: this.buildHeaders(options.headers),
      signal: controller.signal
    };

    if (options.body !== undefined) {
      const prepared = this.prepareBody(options.body);
      init.body = prepared.body;
      init.headers = prepared.headers;
    }

    try {
      const response = await fetch(url, init as RequestInit);
      if (!response.ok) {
        await this.throwError(response);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.raw) {
      return (await this.requestRaw(path, options)) as unknown as T;
    }

    const response = await this.requestRaw(path, options);
    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/plain")) {
      return (await response.text()) as unknown as T;
    }

    return (await response.json()) as T;
  }

  async get<T = unknown>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  async post<T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  async patch<T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  async del<T = unknown>(path: string, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  async authenticate(): Promise<import("./auth.js").UniversalAuthTokens> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("clientId and clientSecret are required to authenticate");
    }

    const tokens = await this.post<import("./auth.js").UniversalAuthTokens>(
      "/api/v1/auth/universal-auth/login",
      { clientId: this.clientId, clientSecret: this.clientSecret }
    );

    this.setToken(tokens.accessToken);
    return tokens;
  }

  private async throwError(response: Response): Promise<never> {
    let payload: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    try {
      payload = contentType.includes("application/json") ? await response.json() : await response.text();
    } catch {
      payload = response.statusText;
    }

    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String(payload.message)
        : typeof payload === "string"
          ? payload
          : response.statusText;

    const code =
      typeof payload === "object" && payload !== null && "code" in payload
        ? String(payload.code)
        : `HTTP_${response.status}`;

    throw new SanctumApiError(message, code, response.status, payload);
  }
}
