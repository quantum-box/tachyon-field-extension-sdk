import { describe, expect, it, vi } from 'vitest'
import {
  type FieldExtensionApiError,
  FieldExtensionContextError,
  createFieldExtensionClient,
  readFieldExtensionContext,
} from './index'

describe('readFieldExtensionContext', () => {
  it('reads extension context from iframe URL query', () => {
    const context = readFieldExtensionContext({
      href: 'https://example.com/ui?tenant=tn_1&extensionAppName=tachyonfield-golf&surface=ui&proxyBase=/api/extensions/tachyonfield-golf/',
    })

    expect(context).toEqual({
      tenant: 'tn_1',
      extensionAppName: 'tachyonfield-golf',
      fieldOrigin: 'https://example.com',
      surface: 'ui',
      proxyBase: '/api/extensions/tachyonfield-golf',
    })
  })

  it('fails closed when a required context parameter is missing', () => {
    expect(() =>
      readFieldExtensionContext({
        href: 'https://example.com/ui?tenant=tn_1',
      }),
    ).toThrow(FieldExtensionContextError)
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
      location: {
        href: 'https://field.example.com/ui?tenant=tn_1&extensionAppName=tachyonfield-golf&surface=ui&proxyBase=/api/extensions/tachyonfield-golf',
      },
      fetch: fetchMock as typeof fetch,
    })

    await expect(
      client.extensionApi.post('/pricing/preview', { courseId: 'weekday' }, {
        query: { mode: 'draft' },
      }),
    ).resolves.toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://field.example.com/api/extensions/tachyonfield-golf/pricing/preview?tenant=tn_1&mode=draft',
    )
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ courseId: 'weekday' }))
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('raises a typed API error for non-2xx JSON responses', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'forbidden' }), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createFieldExtensionClient({
      location: {
        href: 'https://field.example.com/ui?tenant=tn_1&extensionAppName=tachyonfield-golf&surface=ui&proxyBase=/api/extensions/tachyonfield-golf',
      },
      fetch: fetchMock as typeof fetch,
    })

    await expect(client.extensionApi.get('/secure')).rejects.toMatchObject({
      name: 'FieldExtensionApiError',
      message: 'forbidden',
      status: 403,
    } satisfies Partial<FieldExtensionApiError>)
  })

  it('posts frame lifecycle messages to parent', () => {
    const parent = { postMessage: vi.fn() }
    const client = createFieldExtensionClient({
      location: {
        href: 'https://field.example.com/ui?tenant=tn_1&extensionAppName=tachyonfield-golf&surface=ui&proxyBase=/api/extensions/tachyonfield-golf',
      },
      fetch: vi.fn() as unknown as typeof fetch,
      parent,
    })

    client.frame.ready()
    client.frame.resize(720)
    client.frame.reportError(new Error('boom'))

    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'tachyonfield-extension',
        event: 'ready',
        tenant: 'tn_1',
      }),
      '*',
    )
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'resize',
        height: 720,
      }),
      '*',
    )
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'error',
        message: 'boom',
      }),
      '*',
    )
  })
})
