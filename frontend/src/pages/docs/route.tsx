import { createFileRoute } from "@tanstack/react-router";

import { DocsPage } from "./DocsPage";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  context: () => ({
    breadcrumbs: [{ label: "Documentation" }]
  })
});
