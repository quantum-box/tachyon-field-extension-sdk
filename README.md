# TACHYON Field Extension SDK

SDKs for building TACHYON Field Cloud App extensions.

The first package is the browser SDK used inside Cloud App UI pages embedded by
TACHYON Field admin.

```ts
import { createFieldExtensionClient } from '@tachyon/field-extension-sdk'

const field = createFieldExtensionClient()

field.frame.ready()

const preview = await field.extensionApi.post('/pricing/preview', {
  courseId: 'weekday',
  subjectCount: 2,
})
```

The browser SDK reads `tenant`, `extensionAppName`, `surface`, `proxyBase`, and
optional `contractVersion=1` from the iframe URL. API calls go through the Field
host `proxyBase`; the SDK appends the `tenant` query parameter but does not add
browser-side credentials or operator headers. The Field host/proxy owns token
pass-through.

## Packages

- `packages/browser` -> `@tachyon/field-extension-sdk`

## Docs

- `docs/host-contract.md`

## Development

```bash
npm install
npm run ts
npm test
npm run build
```
