export const FIELD_EXTENSION_HOST_CONTRACT_VERSION = '1' as const

export const FIELD_EXTENSION_HOST_QUERY_KEYS = {
  tenant: 'tenant',
  extensionAppName: 'extensionAppName',
  surface: 'surface',
  proxyBase: 'proxyBase',
  contractVersion: 'contractVersion',
} as const

export const FIELD_EXTENSION_MESSAGE_SOURCE = 'tachyonfield-extension' as const
export const FIELD_EXTENSION_HOST_MESSAGE_SOURCE = 'tachyonfield-host' as const

export const FIELD_EXTENSION_MESSAGE_EVENTS = {
  ready: 'ready',
  resize: 'resize',
  error: 'error',
  reload: 'reload',
} as const

export type FieldExtensionSurface = 'ui' | 'kiosk'

export type FieldExtensionContext = {
  tenant: string
  extensionAppName: string
  surface: FieldExtensionSurface
  proxyBase: string
  fieldOrigin: string
  hostOrigin: string
  contractVersion: typeof FIELD_EXTENSION_HOST_CONTRACT_VERSION
}

export type FieldExtensionClientOptions = {
  location?: LocationLike
  fetch?: typeof fetch
  parent?: WindowLike
  document?: DocumentLike
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
  reportError(error: unknown, code?: string): void
  requestReload(): void
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

type DocumentLike = {
  documentElement: {
    scrollHeight: number
  }
}

type ErrorPayload = {
  message?: string
  error?: string
  error_description?: string
  code?: string
  errorCode?: string
  [key: string]: unknown
}

type FieldExtensionMessageEvent =
  (typeof FIELD_EXTENSION_MESSAGE_EVENTS)[keyof typeof FIELD_EXTENSION_MESSAGE_EVENTS]

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
  readonly code?: string
  readonly url: string

  constructor(args: {
    status: number
    statusText: string
    payload: unknown
    url: string
    code?: string
  }) {
    super(errorMessage(args.status, args.statusText, args.payload))
    this.name = 'FieldExtensionApiError'
    this.status = args.status
    this.statusText = args.statusText
    this.payload = args.payload
    this.url = args.url
    this.code = args.code
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
    frame: createFrameClient(
      context,
      options.parent ?? globalThis.parent,
      options.document ?? globalThis.document,
    ),
  }
}

export function readFieldExtensionContext(location: LocationLike): FieldExtensionContext {
  const url = new URL(location.href)
  const tenant = requiredParam(url, FIELD_EXTENSION_HOST_QUERY_KEYS.tenant)
  const extensionAppName = requiredParam(
    url,
    FIELD_EXTENSION_HOST_QUERY_KEYS.extensionAppName,
  )
  const surface = requiredSurface(url)
  const proxyBase = requiredParam(url, FIELD_EXTENSION_HOST_QUERY_KEYS.proxyBase)
  const contractVersion =
    url.searchParams.get(FIELD_EXTENSION_HOST_QUERY_KEYS.contractVersion) ??
    FIELD_EXTENSION_HOST_CONTRACT_VERSION
  const hostOrigin = url.searchParams.get('hostOrigin') ?? url.origin

  if (contractVersion !== FIELD_EXTENSION_HOST_CONTRACT_VERSION) {
    throw new FieldExtensionContextError(
      `Unsupported Field extension host contract version: ${contractVersion}`,
    )
  }

  return {
    tenant,
    extensionAppName,
    surface,
    proxyBase: normalizeProxyBase(proxyBase),
    fieldOrigin: url.origin,
    hostOrigin,
    contractVersion,
  }
}

export function buildFieldExtensionProxyUrl(
  context: FieldExtensionContext,
  path: string,
  query?: FieldExtensionRequestOptions['query'],
) {
  return buildProxyUrl(context, path, query)
}

export function isExpectedHostMessage(
  context: FieldExtensionContext,
  event: MessageEvent,
) {
  return (
    event.origin === context.hostOrigin &&
    isRecord(event.data) &&
    event.data.source === FIELD_EXTENSION_HOST_MESSAGE_SOURCE &&
    (event.data.contractVersion === undefined ||
      event.data.contractVersion === context.contractVersion)
  )
}

function createExtensionApiClient(
  context: FieldExtensionContext,
  fetchImpl: typeof fetch,
): FieldExtensionApiClient {
  const request = async <T = unknown>(
    path: string,
    options: FieldExtensionRequestOptions = {},
  ): Promise<T> => {
    const url = buildProxyUrl(context, path, options.query)
    const response = await fetchImpl(url, {
      ...options,
      headers: buildHeaders(options.headers, options.body),
      body: buildBody(options.body),
    })
    return parseResponse<T>(response, url)
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
  document?: DocumentLike,
): FieldExtensionFrameClient {
  const post = (event: FieldExtensionMessageEvent, detail: Record<string, unknown> = {}) => {
    parentWindow?.postMessage(
      {
        source: FIELD_EXTENSION_MESSAGE_SOURCE,
        event,
        contractVersion: context.contractVersion,
        extensionAppName: context.extensionAppName,
        tenant: context.tenant,
        surface: context.surface,
        ...detail,
      },
      context.hostOrigin,
    )
  }

  return {
    ready: () => post(FIELD_EXTENSION_MESSAGE_EVENTS.ready),
    resize: height =>
      post(FIELD_EXTENSION_MESSAGE_EVENTS.resize, {
        height: height ?? document?.documentElement.scrollHeight ?? 320,
      }),
    reportError: (error, code) =>
      post(FIELD_EXTENSION_MESSAGE_EVENTS.error, {
        message: error instanceof Error ? error.message : String(error),
        ...(code ? { code } : {}),
      }),
    requestReload: () => post(FIELD_EXTENSION_MESSAGE_EVENTS.reload),
  }
}

function buildProxyUrl(
  context: FieldExtensionContext,
  path: string,
  query?: FieldExtensionRequestOptions['query'],
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${context.proxyBase}${normalizedPath}`, context.fieldOrigin)
  applyQuery(url, path)
  applyQuery(url, query)
  url.searchParams.set(FIELD_EXTENSION_HOST_QUERY_KEYS.tenant, context.tenant)
  return url.toString()
}

function applyQuery(
  url: URL,
  query?: string | URLSearchParams | Record<string, string | number | boolean | null | undefined>,
) {
  if (!query) {
    return
  }
  if (typeof query === 'string') {
    const questionIndex = query.indexOf('?')
    if (questionIndex === -1) {
      return
    }
    new URLSearchParams(query.slice(questionIndex + 1)).forEach((value, key) =>
      url.searchParams.set(key, value),
    )
    return
  }
  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => url.searchParams.set(key, value))
    return
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }
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

async function parseResponse<T>(response: Response, url: string): Promise<T> {
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new FieldExtensionApiError({
      status: response.status,
      statusText: response.statusText,
      payload,
      url,
      code: errorCode(payload),
    })
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

function requiredParam(url: URL, name: string) {
  const value = url.searchParams.get(name)
  if (!value) {
    throw new FieldExtensionContextError(`${name} query parameter is required`)
  }
  return value
}

function requiredSurface(url: URL): FieldExtensionSurface {
  const surface = requiredParam(url, FIELD_EXTENSION_HOST_QUERY_KEYS.surface)
  if (surface !== 'ui' && surface !== 'kiosk') {
    throw new FieldExtensionContextError(
      'surface query parameter must be either ui or kiosk',
    )
  }
  return surface
}

function normalizeProxyBase(proxyBase: string) {
  if (!proxyBase.startsWith('/api/extensions/')) {
    throw new FieldExtensionContextError('proxyBase must start with /api/extensions/')
  }
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
  if (isRecord(payload)) {
    const errorPayload = payload as ErrorPayload
    return errorPayload.message ?? errorPayload.error_description ?? errorPayload.error ?? fallback
  }
  return fallback
}

function errorCode(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined
  }
  const errorPayload = payload as ErrorPayload
  return errorPayload.code ?? errorPayload.errorCode ?? errorPayload.error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
