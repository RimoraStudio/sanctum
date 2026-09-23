import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateExternalSanctumConnectionSchema,
  SanitizedExternalSanctumConnectionSchema,
  UpdateExternalSanctumConnectionSchema
} from "@app/services/app-connection/external-sanctum";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

const RemoteProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  environments: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() }))
});

const RemoteEnvironmentFolderTreeSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    folders: z.array(z.object({ id: z.string(), name: z.string(), path: z.string() }))
  })
);

export const registerExternalSanctumConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.ExternalSanctum,
    server,
    sanitizedResponseSchema: SanitizedExternalSanctumConnectionSchema,
    createSchema: CreateExternalSanctumConnectionSchema,
    updateSchema: UpdateExternalSanctumConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listExternalSanctumProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projects: RemoteProjectSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;
      const projects = await server.services.appConnection.externalSanctum.listProjects(connectionId, req.permission);
      return { projects };
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/projects/:projectId/environment-folder-tree`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getExternalSanctumEnvironmentFolderTree",
      params: z.object({
        connectionId: z.string().uuid(),
        projectId: z.string().uuid()
      }),
      response: {
        200: RemoteEnvironmentFolderTreeSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId, projectId } = req.params;
      return server.services.appConnection.externalSanctum.getEnvironmentFolderTree(
        connectionId,
        projectId,
        req.permission
      );
    }
  });
};
