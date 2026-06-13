---
name: code_execution sandbox env access
description: How to read environment variables / managed secrets from inside the code_execution sandbox
---

The `code_execution` JS sandbox does NOT expose `process.env` (it is `undefined`).
To read an env var or managed secret (e.g. `DATABASE_URL`) into memory there,
spawn a subprocess that inherits the real environment:

```js
const { execSync } = await import("node:child_process");
const val = execSync("printenv DATABASE_URL", { encoding: "utf8" }).trim();
```

**Why:** needed when deriving one secret from another (e.g. building
`TEST_DATABASE_URL` from `DATABASE_URL`) without ever printing the value.
Never `console.log` the secret; the platform may redact it and it leaks to chat.

**How to apply:** to set a derived env var, read source via `printenv` in a
subprocess, transform in-memory, then call `setEnvVars({...})`. `setEnvVars`
only handles env vars (not secrets); there is no setSecret — user-provided
secrets must come via `requestEnvVar`.
