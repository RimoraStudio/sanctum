import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const MAX_FILE_BYTES = 32 * 1024 * 1024;

const secretFileSchema = z.object({
  id: z.string().uuid(),
  envId: z.string().uuid(),
  secretPath: z.string(),
  name: z.string(),
  localPath: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sha256: z.string(),
  sizeBytes: z.number(),
  version: z.number().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

const fileScopeQuery = z.object({
  projectId: z.string().trim().max(64),
  environment: z.string().trim().max(64),
  path: z.string().trim().max(1024).default("/")
});

const listQuery = z.object({
  projectId: z.string().trim().max(64),
  environment: z.string().trim().max(64),
  path: z.string().trim().max(1024).optional()
});

const uploadQuery = fileScopeQuery.extend({
  localPath: z.string().trim().max(1024).optional(),
  description: z.string().trim().max(1024).optional(),
  sha256: z.string().trim().length(64)
});

export const registerSecretFileRouter = async (server: FastifyZodProvider) => {
  void server.register(async (fileScope) => {
    fileScope.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_FILE_BYTES }, (_req, body, done) => {
      done(null, body);
    });

    fileScope.route({
      url: "/:name",
      method: "PUT",
      config: {
        rateLimit: writeLimit
      },
      schema: {
        hide: true,
        body: z.any(),
        params: z.object({ name: z.string().trim().min(1).max(255) }),
        querystring: uploadQuery
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      handler: async (req) => {
        const content = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "binary");
        const { name } = req.params as { name: string };
        const { projectId, environment, path, localPath, description, sha256 } =
          req.query as z.infer<typeof uploadQuery>;
        const file = await server.services.secretFile.upload({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          projectId,
          environment,
          secretPath: path,
          name,
          localPath,
          description,
          sha256,
          content
        });
        return { file };
      }
    });
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      querystring: listQuery,
      response: { 200: z.object({ files: z.array(secretFileSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, environment, path } = req.query;
      const files = await server.services.secretFile.list({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        environment,
        secretPath: path
      });
      return { files };
    }
  });

  server.route({
    url: "/:fileId/download",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      params: z.object({ fileId: z.string().uuid() }),
      querystring: z.object({ projectId: z.string().trim() })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      const { file, content } = await server.services.secretFile.download({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId,
        fileId: req.params.fileId
      });
      reply.header("content-disposition", `attachment; filename="${encodeURIComponent(String(file.name))}"`);
      reply.header("x-sanctum-file-sha256", file.sha256);
      return reply.send(content);
    }
  });

  server.route({
    url: "/:fileId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      params: z.object({ fileId: z.string().uuid() }),
      querystring: z.object({ projectId: z.string().trim() }),
      response: { 200: z.object({ file: secretFileSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const file = await server.services.secretFile.deleteFile({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId,
        fileId: req.params.fileId
      });
      return { file };
    }
  });
};
