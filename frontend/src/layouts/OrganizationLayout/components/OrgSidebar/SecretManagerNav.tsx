import { ActivityIcon, Blocks, BookCheck, FileIcon, FileText, Settings, Shield } from "lucide-react";

import { ProjectIcon, SidebarCollapsibleGroup } from "@app/components/v3";

import { ProjectNavList } from "./ProjectNavLink";
import { SM_SETTINGS_SUBMENU } from "./submenus";
import type { NavItem, Submenu } from "./types";
import { useCanSeeAccessManagement } from "./useAccessManagementGuard";
import { useApprovalSubmenu } from "./useApprovalSubmenu";

export const SecretManagerNav = ({
  onSubmenuOpen
}: {
  onSubmenuOpen: (submenu: Submenu) => void;
}) => {
  const { pendingRequestsCount } = useApprovalSubmenu();
  const canSeeAccessManagement = useCanSeeAccessManagement();

  const generalItems: NavItem[] = [
    {
      label: "Secrets",
      icon: ProjectIcon,
      pathSuffix: "overview",
      activeMatch: /\/secrets\//
    },
    {
      label: "Files",
      icon: FileIcon,
      pathSuffix: "files",
      activeMatch: /\/files/
    },
    {
      label: "Approvals",
      icon: BookCheck,
      pathSuffix: "approval",
      badgeCount: pendingRequestsCount || undefined
    },
    {
      label: "Integrations",
      icon: Blocks,
      pathSuffix: "integrations",
      // Keep highlighted on integration detail pages and the standalone app-connections page
      activeMatch: /\/app-connections|\/integrations\//
    },
    {
      label: "Insights",
      icon: ActivityIcon,
      pathSuffix: "insights"
    }
  ];

  const administrationItems: NavItem[] = [
    {
      label: "Access Management",
      icon: Shield,
      pathSuffix: "access-management",
      activeMatch: /\/groups\/|\/identities\/|\/members\/|\/roles\//,
      hidden: !canSeeAccessManagement
    },
    { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
    { label: "Settings", icon: Settings, pathSuffix: "settings", submenu: SM_SETTINGS_SUBMENU }
  ];

  return (
    <>
      <ProjectNavList items={generalItems} onSubmenuOpen={onSubmenuOpen} />
      <SidebarCollapsibleGroup label="Administration">
        <ProjectNavList items={administrationItems} onSubmenuOpen={onSubmenuOpen} />
      </SidebarCollapsibleGroup>
    </>
  );
};
