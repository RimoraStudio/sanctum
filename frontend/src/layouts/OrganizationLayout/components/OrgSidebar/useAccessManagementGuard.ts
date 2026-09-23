import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";

// Mirrors the tabs guarded inside the project access-management page: show the nav item only when
// the user can read at least one of its four sections.
export const useCanSeeAccessManagement = () => {
  const { permission } = useProjectPermission();
  return (
    permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) ||
    permission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups) ||
    permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role)
  );
};
