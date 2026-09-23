import type { SanctumClient } from "./client.js";

export interface Project {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEnvironment {
  id: string;
  name: string;
  slug: string;
  position: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  projectName: string;
  slug?: string;
  type?: "secret-manager" | "cert-manager" | "kms" | "secret-scanning" | "pam";
  shouldCreateDefaultEnvs?: boolean;
}

export interface ProjectsApi {
  list(): Promise<{ projects: Project[] }>;
  get(projectId: string): Promise<{ project: Project }>;
  getBySlug(slug: string): Promise<Project>;
  create(input: CreateProjectInput): Promise<{ project: Project }>;
  listEnvironments(projectId: string): Promise<{ environments: ProjectEnvironment[] }>;
  getEnvironmentBySlug(projectId: string, envSlug: string): Promise<{ environment: ProjectEnvironment }>;
}

export const createProjects = (client: SanctumClient): ProjectsApi => ({
  list: () => client.get<{ projects: Project[] }>("/api/v1/projects"),
  get: (projectId) => client.get<{ project: Project }>(`/api/v1/projects/${projectId}`),
  getBySlug: (slug) => client.get<Project>(`/api/v1/projects/slug/${encodeURIComponent(slug)}`),
  create: (input) => client.post<{ project: Project }>("/api/v1/projects", input),
  listEnvironments: async (projectId) => {
    const { project } = await client.get<{ project: Project & { environments: ProjectEnvironment[] } }>(
      `/api/v1/projects/${projectId}`
    );
    return { environments: project.environments ?? [] };
  },
  getEnvironmentBySlug: (projectId, envSlug) =>
    client.get<{ environment: ProjectEnvironment }>(
      `/api/v1/projects/${projectId}/environments/slug/${encodeURIComponent(envSlug)}`
    )
});
