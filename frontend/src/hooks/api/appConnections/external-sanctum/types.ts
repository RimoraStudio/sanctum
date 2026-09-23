export type TRemoteSanctumProject = {
  id: string;
  name: string;
  slug: string;
  environments: Array<{ id: string; name: string; slug: string }>;
};

export type TRemoteSanctumFolder = {
  id: string;
  name: string;
  path: string;
};

export type TRemoteSanctumEnvironmentFolderTree = Record<
  string,
  { id: string; name: string; slug: string; folders: TRemoteSanctumFolder[] }
>;
