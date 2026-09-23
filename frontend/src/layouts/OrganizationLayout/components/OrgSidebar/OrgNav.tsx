import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Blocks,
  CreditCard,
  FileKey,
  FileText,
  Key,
  KeyRound,
  ScanSearch,
  Settings,
  Shield,
  ShieldCheck
} from "lucide-react";

import { OrgIcon, SidebarCollapsibleGroup, SubOrgIcon } from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionGroupActions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";

import { OrgNavList } from "./OrgNavLink";
import { OrgSettingsSubmenuView } from "./OrgSubmenuView";
import type { OrgNavGroup } from "./types";

// --- Org nav ---

export const OrgNav = () => {
  const { currentOrg, isRootOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const canSeeAccessManagement =
    permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Member) ||
    permission.can(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity) ||
    permission.can(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups) ||
    permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // /settings, /sso, /networking and /oauth-applications all live under the settings submenu.
  const isOnSettingsArea =
    /\/organizations\/[^/]+\/(settings|sso|networking|oauth-applications)(\/|$)/.test(pathname);
  const [showSettings, setShowSettings] = useState(isOnSettingsArea);

  useEffect(() => {
    setShowSettings(isOnSettingsArea);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenSettings = () => {
    setShowSettings(true);
    // Already on a settings-area URL (e.g. after collapsing via "< Settings"):
    // re-navigating would push a duplicate same-URL history entry, so just
    // re-expand the sub-nav.
    if (isOnSettingsArea) return;
    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { selectedTab: "" }
    });
  };

  const groups: OrgNavGroup[] = [
    {
      label: "General",
      collapsible: false,
      items: [
        {
          label: "Home",
          icon: isRootOrganization ? OrgIcon : SubOrgIcon,
          pathSuffix: "projects"
        },
        {
          label: "Integrations",
          icon: Blocks,
          pathSuffix: "integrations",
          // Keep highlighted on the app-connections OAuth/manifest callback pages
          activeMatch: /organizations\/[^/]+\/app-connections/
        }
      ]
    },
    {
      label: "Products",
      items: [
        {
          label: "Secrets Management",
          icon: KeyRound,
          pathSuffix: "projects/secret-management",
          activeMatch: /organizations\/[^/]+\/projects\/secret-management\//
        },
        {
          label: "Certificate Manager",
          icon: FileKey,
          pathSuffix: "projects/cert-manager",
          activeMatch: /organizations\/[^/]+\/projects\/cert-manager\//
        },
        {
          label: "KMS",
          icon: Key,
          pathSuffix: "projects/kms",
          activeMatch: /organizations\/[^/]+\/projects\/kms\//
        },
        {
          label: "Secret Scanning",
          icon: ScanSearch,
          pathSuffix: "projects/secret-scanning",
          activeMatch: /organizations\/[^/]+\/projects\/secret-scanning\//
        },
        {
          label: "PAM",
          icon: ShieldCheck,
          pathSuffix: "pam",
          activeMatch: /organizations\/[^/]+\/pam\//
        }
      ]
    },
    {
      label: "Administration",
      items: [
        {
          label: "Access Management",
          icon: Shield,
          pathSuffix: "access-management",
          activeMatch: /organizations\/[^/]+\/(members|identities|groups|roles)/,
          hidden: !canSeeAccessManagement
        },
        {
          label: "Usage & Billing",
          icon: CreditCard,
          pathSuffix: "billing",
          hidden: !isRootOrganization
        },
        { label: "Audit Logs", icon: FileText, pathSuffix: "audit-logs" },
        { label: "Settings", icon: Settings, pathSuffix: "settings", opensSubmenu: true }
      ]
    }
  ];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showSettings ? (
        <motion.div
          key="submenu"
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          <OrgSettingsSubmenuView onBack={() => setShowSettings(false)} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -30, opacity: 0 }}
          transition={{ duration: 0.11, ease: "easeOut" }}
        >
          {groups.map((group) => (
            <SidebarCollapsibleGroup
              key={group.label}
              label={group.label}
              collapsible={group.collapsible}
              defaultOpen={group.defaultOpen}
            >
              <OrgNavList items={group.items} onOpenSubmenu={handleOpenSettings} />
            </SidebarCollapsibleGroup>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
