# TACHYON Field Extension Host Contract

TACHYON Field hosts Cloud App extensions inside tenant-scoped admin routes.

## UI Embed

Field admin resolves installed Cloud Apps from the Cloud App registry and embeds the
extension UI with an iframe:

```text
/{tenant}/extensions/{appName}
  -> iframe src="{cloudApp.ui.url}?tenant=...&extensionAppName=...&surface=ui&proxyBase=..."
```

The iframe URL receives:

- `tenant`: the current Field tenant/operator id.
- `extensionAppName`: the Cloud App name resolved from the registry.
- `surface`: the host surface such as `ui` or `kiosk`.
- `proxyBase`: same-origin Field admin proxy base for extension API calls.

The iframe navigation itself does not receive a custom `Authorization` header.
Sensitive data access should happen through the Field same-origin proxy.

## Extension API Calls

Browser extension code calls its Cloud App API through `proxyBase`:

```text
Cloud App UI -> Field admin proxy -> Cloud App extension API
```

The proxy resolves the installed Cloud App from the registry, strips hop-by-hop headers,
and forwards the request with the current Field admin access token.

## Browser SDK Scope

`@tachyon/field-extension-sdk` is a browser SDK for iframe UI code. It:

- reads extension context from iframe URL parameters;
- builds proxy URLs;
- provides typed JSON request helpers;
- normalizes non-2xx responses into `FieldExtensionApiError`;
- posts frame lifecycle messages such as `ready`, `resize`, and `error`.

It does not provide a Field API client in v0. Field API access should be handled by
extension server code or a future host route / server SDK contract.
