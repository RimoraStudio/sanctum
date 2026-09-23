import { useEffect, useMemo, useRef } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen, ChevronLeft } from "lucide-react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { twMerge } from "tailwind-merge";

import accessControlContent from "./content/access-control.md?raw";
import administrationContent from "./content/administration.md?raw";
import auditLogsContent from "./content/audit-logs.md?raw";
import certManagerContent from "./content/certificate-manager.md?raw";
import cliContent from "./content/cli.md?raw";
import gettingStartedContent from "./content/getting-started.md?raw";
import integrationsContent from "./content/integrations.md?raw";
import kmsContent from "./content/kms.md?raw";
import machineIdentitiesContent from "./content/machine-identities.md?raw";
import networkingContent from "./content/networking.md?raw";
import pamContent from "./content/pam.md?raw";
import sdkContent from "./content/sdk.md?raw";
import secretScanningContent from "./content/secret-scanning.md?raw";
import secretsManagementContent from "./content/secrets-management.md?raw";
import selfHostingContent from "./content/self-hosting.md?raw";

type DocsSection = { id: string; label: string; group: string; content: string };

const SECTIONS: DocsSection[] = [
  { id: "getting-started", label: "Getting Started", group: "General", content: gettingStartedContent },
  { id: "access-control", label: "Access Control & Roles", group: "General", content: accessControlContent },
  { id: "machine-identities", label: "Machine Identities", group: "General", content: machineIdentitiesContent },
  { id: "secrets-management", label: "Secrets Management", group: "Products", content: secretsManagementContent },
  { id: "certificate-manager", label: "Certificate Manager", group: "Products", content: certManagerContent },
  { id: "kms", label: "KMS", group: "Products", content: kmsContent },
  { id: "secret-scanning", label: "Secret Scanning", group: "Products", content: secretScanningContent },
  { id: "pam", label: "PAM", group: "Products", content: pamContent },
  { id: "integrations", label: "Integrations & Syncs", group: "Platform", content: integrationsContent },
  { id: "audit-logs", label: "Audit Logs & Alerts", group: "Platform", content: auditLogsContent },
  { id: "networking", label: "Networking & Gateways", group: "Platform", content: networkingContent },
  { id: "administration", label: "Administration", group: "Platform", content: administrationContent },
  { id: "cli", label: "CLI", group: "Developer", content: cliContent },
  { id: "sdk", label: "SDK", group: "Developer", content: sdkContent },
  { id: "self-hosting", label: "Self-Hosting", group: "Deployment", content: selfHostingContent }
];

const groups = ["General", "Products", "Platform", "Developer", "Deployment"];

export const DocsPage = () => {
  const { hash } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeId = hash && SECTIONS.some((s) => s.id === hash) ? hash : "getting-started";
  const active = useMemo(() => SECTIONS.find((s) => s.id === activeId)!, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeId]);

  return (
    <div className="flex h-screen overflow-hidden bg-bunker-800 text-mineshaft-50">
      <Helmet>
        <title>Documentation | Sanctum</title>
      </Helmet>
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border px-5 py-6 md:flex">
        <Link to="/docs" className="mb-6 flex items-center gap-2 text-sm font-medium">
          <BookOpen className="size-4 text-primary" />
          Documentation
        </Link>
        <nav className="flex flex-1 flex-col gap-5">
          {groups.map((group) => (
            <div key={group}>
              <div className="mb-1.5 text-xs font-medium tracking-wide text-mineshaft-400 uppercase">
                {group}
              </div>
              <div className="flex flex-col">
                {SECTIONS.filter((s) => s.group === group).map((s) => (
                  <Link
                    key={s.id}
                    to="/docs"
                    hash={s.id}
                    className={twMerge(
                      "-mx-2 rounded px-2 py-1 text-sm text-mineshaft-300 hover:bg-mineshaft-800 hover:text-mineshaft-50",
                      s.id === activeId && "bg-mineshaft-800 text-primary"
                    )}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-mineshaft-400 hover:text-mineshaft-200"
        >
          <ChevronLeft className="size-3.5" />
          Back to app
        </Link>
      </aside>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <main className="mx-auto max-w-3xl px-6 py-8 pb-24">
          <div className="mb-4 md:hidden">
            <select
              className="w-full rounded border border-mineshaft-600 bg-bunker-700 px-3 py-2 text-sm"
              value={activeId}
              onChange={(e) => {
                window.location.hash = e.target.value;
              }}
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <article className="docs-content">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {active.content}
            </Markdown>
          </article>
        </main>
      </div>
    </div>
  );
};
