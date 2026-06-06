export type FieldExtensionSurface = 'ui' | 'kiosk' | (string & {})

export type FieldExtensionContext = {
  tenant: string
  extensionAppName: string
  surface: FieldExtensionSurface
  proxyBase: string
  fieldOrigin: string
}

export type FieldExtensionClientOptions = {
  location?: LocationLike
  fetch?: typeof fetch
  parent?: WindowLike
}

export type FieldExtensionRequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | null
  query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>
}

export type FieldExtensionApiClient = {
  request<T = unknown>(
    path: string,
    options?: FieldExtensionRequestOptions,
  ): Promise<T>
  get<T = unknown>(path: string, options?: FieldExtensionRequestOptions): Promise<T>
  post<T = unknown>(
    path: string,
    body?: FieldExtensionRequestOptions['body'],
    options?: FieldExtensionRequestOptions,
  ): Promise<T>
  put<T = unknown>(
    path: string,
    body?: FieldExtensionRequestOptions['body'],
    options?: FieldExtensionRequestOptions,
  ): Promise<T>
  patch<T = unknown>(
    path: string,
    body?: FieldExtensionRequestOptions['body'],
    options?: FieldExtensionRequestOptions,
  ): Promise<T>
  delete<T = unknown>(path: string, options?: FieldExtensionRequestOptions): Promise<T>
}

export type FieldExtensionFrameClient = {
  ready(): void
  resize(height?: number): void
  reportError(error: unknown): void
}

export type FieldExtensionClient = {
  context: FieldExtensionContext
  extensionApi: FieldExtensionApiClient
  frame: FieldExtensionFrameClient
}

type LocationLike = {
  href: string
}

type WindowLike = {
  postMessage(message: unknown, targetOrigin: string): void
}

type ErrorPayload = {
  message?: string
  error?: string
  [key: string]: unknown
}

export class FieldExtensionContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldExtensionContextError'
  }
}

export class FieldExtensionApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly payload: unknown

  constructor(status: number, statusText: string, payload: unknown) {
    super(errorMessage(status, statusText, payload))
    this.name = 'FieldExtensionApiError'
    this.status = status
    this.statusText = statusText
    this.payload = payload
  }
}

export function createFieldExtensionClient(
  options: FieldExtensionClientOptions = {},
): FieldExtensionClient {
  const location = options.location ?? globalThis.location
  if (!location) {
    throw new FieldExtensionContextError('location is not available')
  }

  const context = readFieldExtensionContext(location)
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis)
  if (!fetchImpl) {
    throw new FieldExtensionContextError('fetch is not available')
  }

  return {
    context,
    extensionApi: createExtensionApiClient(context, fetchImpl),
    frame: createFrameClient(context, options.parent ?? globalThis.parent),
  }
}

export function readFieldExtensionContext(location: LocationLike): FieldExtensionContext {
  const url = new URL(location.href)
  const tenant = requiredParam(url, 'tenant')
  const extensionAppName = requiredParam(url, 'extensionAppName')
  const surface = requiredParam(url, 'surface') as FieldExtensionSurface
  const proxyBase = requiredParam(url, 'proxyBase')

  return {
    tenant,
    extensionAppName,
    surface,
    proxyBase: normalizeProxyBase(proxyBase),
    fieldOrigin: url.origin,
  }
}

function createExtensionApiClient(
  context: FieldExtensionContext,
  fetchImpl: typeof fetch,
): FieldExtensionApiClient {
  const request = async <T = unknown>(
    path: string,
    options: FieldExtensionRequestOptions = {},
  ): Promise<T> => {
    const response = await fetchImpl(buildProxyUrl(context, path, options.query), {
      ...options,
      headers: buildHeaders(options.headers, options.body),
      body: buildBody(options.body),
    })
    return parseResponse<T>(response)
  }

  return {
    request,
    get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options = {}) =>
      request(path, { ...options, method: 'POST', body }),
    put: (path, body, options = {}) =>
      request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options = {}) =>
      request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
  }
}

function createFrameClient(
  context: FieldExtensionContext,
  parentWindow?: WindowLike,
): FieldExtensionFrameClient {
  const post = (event: string, detail: Record<string, unknown> = {}) => {
    parentWindow?.postMessage(
      {
        source: 'tachyonfield-extension',
        event,
        extensionAppName: context.extensionAppName,
        tenant: context.tenant,
        surface: context.surface,
        ...detail,
      },
      '*',
    )
  }

  return {
    ready: () => post('ready'),
    resize: height =>
      post('resize', {
        height: height ?? document.documentElement.scrollHeight,
      }),
    reportError: error =>
      post('error', {
        message: error instanceof Error ? error.message : String(error),
      }),
  }
}

function buildProxyUrl(
  context: FieldExtensionContext,
  path: string,
  query?: FieldExtensionRequestOptions['query'],
) {
  const base = context.proxyBase.endsWith('/')
    ? context.proxyBase.slice(0, -1)
    : context.proxyBase
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${normalizedPath}`, context.fieldOrigin)
  url.searchParams.set('tenant', context.tenant)

  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => url.searchParams.set(key, value))
  } else if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}

function buildHeaders(
  headers: FieldExtensionRequestOptions['headers'],
  body: FieldExtensionRequestOptions['body'],
) {
  const nextHeaders = new Headers(headers)
  if (body && isJsonBody(body) && !nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json')
  }
  return nextHeaders
}

function buildBody(body: FieldExtensionRequestOptions['body']) {
  if (body === undefined || body === null) {
    return undefined
  }
  return isJsonBody(body) ? JSON.stringify(body) : body
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new FieldExtensionApiError(response.status, response.statusText, payload)
  }
  return payload as T
}

async function parsePayload(response: Response) {
  if (response.status === 204) {
    return null
  }
  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

function requiredParam(url: URL, name: keyof FieldExtensionContext) {
  const value = url.searchParams.get(name)
  if (!value) {
    throw new FieldExtensionContextError(`${name} query parameter is required`)
  }
  return value
}

function normalizeProxyBase(proxyBase: string) {
  return proxyBase.replace(/\/+$/, '')
}

function isJsonBody(
  body: FieldExtensionRequestOptions['body'],
): body is Record<string, unknown> | unknown[] {
  return (
    typeof body === 'object' &&
    body !== null &&
    !(body instanceof Blob) &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer)
  )
}

function errorMessage(status: number, statusText: string, payload: unknown) {
  const fallback = `Field extension API request failed: ${status} ${statusText}`.trim()
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }
  if (payload && typeof payload === 'object') {
    const errorPayload = payload as ErrorPayload
    return errorPayload.message ?? errorPayload.error ?? fallback
  }
  return fallback
}
