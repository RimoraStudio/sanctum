import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { highCardinalityMeter, shouldRecordHighCardinalityMetrics } from "@app/lib/telemetry/metrics";

const apiMeter = highCardinalityMeter("API");

const latencyHistogram = apiMeter.createHistogram("API_latency", {
  unit: "ms"
});

const sanctumMeter = highCardinalityMeter("Sanctum");

const requestCounter = sanctumMeter.createCounter("sanctum.http.server.request.count", {
  description: "Total number of API requests to Sanctum (covers both human users and machine identities)",
  unit: "{request}"
});

const requestDurationHistogram = sanctumMeter.createHistogram("sanctum.http.server.request.duration", {
  description: "API request latency",
  unit: "s"
});

export const apiMetrics = fp(async (fastify) => {
  fastify.addHook("onResponse", async (request, reply) => {
    // Checked before assembling the attribute object below: it is built per response and every label on
    // it is per-actor, so it is the largest source of the cardinality these meters would retain.
    if (!shouldRecordHighCardinalityMetrics()) return;

    const { method } = request;
    const route = request.routeOptions.url;
    const { statusCode } = reply;

    latencyHistogram.record(reply.elapsedTime, {
      route,
      method,
      statusCode
    });

    const orgId = requestContext.get(RequestContextKey.OrgId);
    const orgName = requestContext.get(RequestContextKey.OrgName);
    const userAuthInfo = requestContext.get(RequestContextKey.UserAuthInfo);
    const identityAuthInfo = requestContext.get(RequestContextKey.IdentityAuthInfo);
    const projectDetails = requestContext.get(RequestContextKey.ProjectDetails);
    const userAgent = requestContext.get(RequestContextKey.UserAgent);
    const ip = requestContext.get(RequestContextKey.Ip);

    const attributes: Record<string, string | number> = {
      "http.request.method": method,
      "http.route": route ?? "",
      "http.response.status_code": statusCode
    };

    if (orgId) {
      attributes["sanctum.organization.id"] = orgId;
    }
    if (orgName) {
      attributes["sanctum.organization.name"] = orgName;
    }

    if (userAuthInfo) {
      if (userAuthInfo.userId) {
        attributes["sanctum.user.id"] = userAuthInfo.userId;
      }
      if (userAuthInfo.email) {
        attributes["sanctum.user.email"] = userAuthInfo.email;
      }
    }

    if (identityAuthInfo) {
      if (identityAuthInfo.identityId) {
        attributes["sanctum.identity.id"] = identityAuthInfo.identityId;
      }
      if (identityAuthInfo.identityName) {
        attributes["sanctum.identity.name"] = identityAuthInfo.identityName;
      }
      if (identityAuthInfo.authMethod) {
        attributes["sanctum.auth.method"] = identityAuthInfo.authMethod;
      }
    }

    if (projectDetails) {
      if (projectDetails.id) {
        attributes["sanctum.project.id"] = projectDetails.id;
      }
      if (projectDetails.name) {
        attributes["sanctum.project.name"] = projectDetails.name;
      }
    }

    if (userAgent) {
      attributes["user_agent.original"] = userAgent;
    }

    if (ip) {
      attributes["client.address"] = ip;
    }

    requestCounter.add(1, attributes);
    requestDurationHistogram.record(reply.elapsedTime / 1000, attributes);
  });
});
