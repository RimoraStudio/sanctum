# Secret Scanning

Continuously scan repositories and builds for leaked credentials. Detected
exposures become findings you can triage and resolve.

## Core features

- **Data sources** — connect GitHub organizations/repositories (app or OAuth),
  GitLab, Bitbucket, and other sources. Scans run on a schedule and on push
  webhooks where supported.
- **Findings** — detected secrets with location (repo, file, commit), secret
  type, and status. Mark resolved, false positive, or accepted risk.
- **Insights & audit reports** — overview dashboards and downloadable reports
  of exposure over time.
- **Scanning configuration** — per-project settings for which sources and rule
  sets are active.

## Typical flow

1. Open a Secret Scanning project.
2. Add a data source (install the Sanctum GitHub app or connect an OAuth app).
3. Let the initial scan complete, then work through Findings.
4. Rotate or revoke any real credentials it surfaces, then mark findings
   resolved.
