# Free local demo deployment evidence

Status: `VERIFIED_EPHEMERAL_DEMO`  
Verified: 2026-10-24  
Branch checkpoint: `codex/interview-readiness-hardening` at `71df93b`

This is deployment evidence for an interview demonstration, not a production-availability claim.
The site ran on the existing Windows computer through Docker Compose and an account-less Cloudflare
Quick Tunnel. No cloud server or domain was purchased. The random URL remains valid only while the
Tunnel process, Docker Desktop, the computer and its network connection remain running.

## Safety configuration

- Web bound only to `127.0.0.1:3300`; Cloudflare proxied that endpoint.
- PostgreSQL, the TypeScript API and Python Agent Runtime had no host/public port mapping.
- `COLLECT_ENABLED=false` and `MODEL_CALLS_ENABLED=false` in API and worker containers.
- Research, research-network, tracking and Product Impact gates were false in the Agent Runtime.
- `DEV_AUTH_ROLE` was unset in every application container.
- `.env`, the portable `cloudflared` binary and runtime logs remained ignored/untracked.
- No paid model, collector or Agent network call was used for deployment verification.

## Verification result

Cloudflare created the temporary URL
`https://license-paintings-pipes-cumulative.trycloudflare.com`. The first creation attempt timed out;
one later scheduled retry succeeded. The tunnel registered successfully, with HTTP/2 available as a
fallback when one regional QUIC precheck failed.

`node scripts/smoke.ts --base <temporary-url>` passed every check:

- public pages and static images;
- health and public v1 APIs;
- RSS, `llms.txt`, robots, sitemap, manifest and OpenAPI;
- MCP initialize after the temporary host was explicitly allowlisted;
- the admin login page.

An unauthenticated request to `/admin` returned `302` to `/admin/login?return=%2Fadmin`; the login page
returned `200`. All five long-running Compose services were up, and PostgreSQL plus Agent Runtime were
healthy. The repository runbook is [`../deploy-local-tunnel.md`](../deploy-local-tunnel.md).

## Honest limitations

- Quick Tunnel has no uptime guarantee and the URL changes after restart.
- The existing computer must stay awake and connected.
- The temporary host is written only to ignored local `.env`; it is not a stable resume link.
- Collection and models were deliberately off, so this checkpoint proves safe deployability and public
  presentation, not continuous live intelligence collection.
- A stable public API/MCP deployment needs a fixed domain with a Named Tunnel or ordinary HTTPS host.

## Operational follow-up — 2026-10-25

The original Tunnel was tied to a Codex terminal session and therefore exited after that session was
released; its URL correctly became unreachable while all local Compose services remained healthy.
The Tunnel was replaced by a standalone `cloudflare/cloudflared:2026.10.3` Docker container with
`--restart unless-stopped` and no published ports. A new ephemeral URL,
`https://ensuring-arrow-dylan-newbie.trycloudflare.com`, passed the complete public smoke suite,
including MCP initialization after `.env` host allowlisting. This improves process persistence but
does not turn Quick Tunnel into a fixed-domain or uptime-guaranteed deployment.
