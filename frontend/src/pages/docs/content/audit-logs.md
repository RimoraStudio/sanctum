# Audit Logs, Alerts & Insights

## Audit logs

Every org-level action (logins, secret reads/writes, permission changes,
project lifecycle) is recorded with actor, timestamp, IP, and metadata. Org
sidebar → **Audit Logs**.

- **Retention** — configurable retention window (this instance: extended).
- **Filters** — filter by actor, event type, project, and time range.
- **Export** — query via API or the CLI (`sanctum` audit commands where
  exposed).

## Audit log streams (SIEM)

Stream audit events to external systems: Datadog, Splunk (HTTP Event
Collector), Elastic, syslog, and webhook endpoints. Org → Audit Logs →
**Audit Log Streams**. Streams support batching, TLS, and custom headers.

## Alerts

User-facing "notify me when X" alerts cover resources across products —
expiring certificates, failed syncs, honey-token reads, and more. Channels:
email, Slack, webhooks, PagerDuty.

## Custom alerts & event subscriptions

Project-level event subscriptions let you subscribe to secret changes and
other events with notification channels, separate from the alert rules engine.

## Insights

Secrets Management → **Insights** shows analytics: secret growth, environment
coverage, usage patterns, and generated audit reports.
