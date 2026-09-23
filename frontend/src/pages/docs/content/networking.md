# Networking: Gateways, Relays & Agent Proxy

Sanctum's networking layer reaches private infrastructure without exposing it
to the internet.

## Gateways

Outbound-only agents you deploy inside your network (Docker, Kubernetes). They
establish a tunnel to Sanctum so the platform can reach private targets:
databases for secret rotation/dynamic secrets, internal APIs for syncs, LDAP
servers for auth.

- **Gateway pools** — group gateways for HA and region affinity.
- **Attach/detach** — gateways register to the org and attach to projects
  that need private reachability.

## Relays

Relay nodes forward traffic between Sanctum and gateways, useful when the
platform itself is behind a firewall or you want regional entry points.

## Agent Proxy

Routes agent/SDK traffic through a managed proxy for egress control, TLS
inspection policies, and network segmentation between environments.

## Deploying

Org → Settings → Networking, or per-gateway deploy dialogs generate the
install command (Docker `docker run`, or Kubernetes manifests via
`sanctum gateway install` / Helm chart `sanctum-gateway`).
