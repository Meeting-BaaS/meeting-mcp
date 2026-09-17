# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to **security@meetingbaas.com**.

Do not open a public GitHub issue for security problems. When reporting, please include:

- a description of the issue and its impact,
- steps to reproduce, with proof-of-concept material attached as files rather than inline links,
- the affected version, commit, or deployment mode,
- any suggested remediation.

We aim to acknowledge reports within 3 business days. We will keep you informed of triage and remediation progress, and we credit reporters by name in advisories unless requested otherwise.

## Scope

The HTTP/SSE deployment mode is intended for local use. It is loopback-only by default, requires an `x-api-key` header on every request, and rejects browser requests from origins outside `MCP_ALLOWED_ORIGINS`. Deployments that set `MCP_ALLOW_REMOTE=true` are responsible for placing the server behind an authenticating, TLS-terminating proxy.

## Supported Versions

Security updates are applied to the latest release on the `main` branch.
