import { describe, expect, it, vi } from 'vitest'
import {
  FIELD_EXTENSION_HOST_CONTRACT_VERSION,
  FIELD_EXTENSION_MESSAGE_SOURCE,
  type FieldExtensionApiError,
  FieldExtensionContextError,
  buildFieldExtensionProxyUrl,
  createFieldExtensionClient,
  isExpectedHostMessage,
  readFieldExtensionContext,
} from './index'

const hostUrl =
  'https://field.example.com/ui?tenant=tn_1&extensionAppName=tachyonfield-golf&surface=ui&proxyBase=/api/extensions/tachyonfield-golf/&hostOrigin=https://admin.example.com'

describe('readFieldExtensionContext', () => {
  it('reads extension context from iframe URL query', () => {
    const context = readFieldExtensionContext({ href: hostUrl })

    expect(context).toEqual({
      tenant: 'tn_1',
      extensionAppName: 'tachyonfield-golf',
      fieldOrigin: 'https://field.example.com',
      hostOrigin: 'https://admin.example.com',
      surface: 'ui',
      proxyBase: '/api/extensions/tachyonfield-golf',
      contractVersion: FIELD_EXTENSION_HOST_CONTRACT_VERSION,
    })
  })

  it('accepts explicit v1 contract version and rejects unsupported versions', () => {
    expect(
      readFieldExtensionContext({ href: `${hostUrl}&contractVersion=1` })
        .contractVersion,
    ).toBe('1')
    expect(() =>
      readFieldExtensionContext({ href: `${hostUrl}&contractVersion=2` }),
    ).toThrow(FieldExtensionContextError)
  })

  it('fails closed when required or invalid context parameters are present', () => {
    expect(() =>
      readFieldExtensionContext({
        href: 'https://example.com/ui?tenant=tn_1',
      }),
    ).toThrow(FieldExtensionContextError)
    expect(() =>
      readFieldExtensionContext({
        href: hostUrl.replace('surface=ui', 'surface=admin'),
      }),
    ).toThrow('surface query parameter must be either ui or kiosk')
    expect(() =>
      readFieldExtensionContext({
        href: hostUrl.replace(
          'proxyBase=/api/extensions/tachyonfield-golf/',
          'proxyBase=/admin',
        ),
      }),
    ).toThrow('proxyBase must start with /api/extensions/')
  })
})

describe('buildFieldExtensionProxyUrl', () => {
  it('builds same-origin proxy URLs and appends tenant query', () => {
    const context = readFieldExtensionContext({ href: hostUrl })

    expect(
      buildFieldExtensionProxyUrl(context, '/pricing/preview?mode=draft'),
    ).toBe(
      'https://field.example.com/api/extensions/tachyonfield-golf/pricing/preview?mode=draft&tenant=tn_1',
    )
  })
})

describe('createFieldExtensionClient', () => {
  it('calls the extension API through proxyBase and appends tenant query', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createFieldExtensionClient({
      location: { href: hostUrl },
      fetch: fetchMock as typeof fetch,
    })

    await expect(
      client.extensionApi.post('/pricing/preview', { courseId: 'weekday' }, {
        query: { mode: 'draft' },
      }),
    ).resolves.toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)
    expect(url).toBe(
      'https://field.example.com/api/extensions/tachyonfield-golf/pricing/preview?mode=draft&tenant=tn_1',
    )
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ courseId: 'weekday' }))
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.has('x-operator-id')).toBe(false)
  })

  it('raises a typed API error for non-2xx JSON responses', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'forbidden', message: 'forbidden' }), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createFieldExtensionClient({
      location: { href: hostUrl },
      fetch: fetchMock as typeof fetch,
    })

    await expect(client.extensionApi.get('/secure')).rejects.toMatchObject({
      name: 'FieldExtensionApiError',
      message: 'forbidden',
      status: 403,
      statusText: 'Forbidden',
      code: 'forbidden',
    } satisfies Partial<FieldExtensionApiError>)
  })

  it('raises a typed API error for non-2xx text responses', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('upstream unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      }),
    )
    const client = createFieldExtensionClient({
      location: { href: hostUrl },
      fetch: fetchMock as typeof fetch,
    })

    await expect(client.extensionApi.get('/secure')).rejects.toMatchObject({
      message: 'upstream unavailable',
      status: 503,
    } satisfies Partial<FieldExtensionApiError>)
  })

  it('posts frame lifecycle messages to the expected host origin', () => {
    const parent = { postMessage: vi.fn() }
    const client = createFieldExtensionClient({
      location: { href: hostUrl },
      fetch: vi.fn() as unknown as typeof fetch,
      parent,
    })

    client.frame.ready()
    client.frame.resize(720)
    client.frame.reportError(new Error('boom'), 'sample.failure')
    client.frame.requestReload()

    expect(parent.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: FIELD_EXTENSION_MESSAGE_SOURCE,
        event: 'ready',
        contractVersion: '1',
        tenant: 'tn_1',
        extensionAppName: 'tachyonfield-golf',
        surface: 'ui',
      }),
      'https://admin.example.com',
    )
    expect(parent.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: 'resize',
        height: 720,
      }),
      'https://admin.example.com',
    )
    expect(parent.postMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        event: 'error',
        message: 'boom',
        code: 'sample.failure',
      }),
      'https://admin.example.com',
    )
    expect(parent.postMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        event: 'reload',
      }),
      'https://admin.example.com',
    )
  })

  it('recognizes host messages from the expected origin and contract version', () => {
    const client = createFieldExtensionClient({
      location: { href: hostUrl },
      fetch: vi.fn() as unknown as typeof fetch,
    })

    expect(
      isExpectedHostMessage(
        client.context,
        messageEvent('https://admin.example.com', {
          source: 'tachyonfield-host',
          contractVersion: '1',
        }),
      ),
    ).toBe(true)
    expect(
      isExpectedHostMessage(
        client.context,
        messageEvent('https://admin.example.com', {
          source: 'tachyonfield-host',
          contractVersion: '2',
        }),
      ),
    ).toBe(false)
    expect(
      isExpectedHostMessage(
        client.context,
        messageEvent('https://evil.example.com', {
          source: 'tachyonfield-host',
          contractVersion: '1',
        }),
      ),
    ).toBe(false)
  })
})

function messageEvent(origin: string, data: unknown) {
  return new MessageEvent('message', { origin, data })
}
