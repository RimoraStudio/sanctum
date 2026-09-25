import { createFileRoute } from "@tanstack/react-router";

import { FilesPage } from "./FilesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/files"
)({
  component: FilesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Files"
        }
      ]
    };
  }
});
