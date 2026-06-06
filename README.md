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
