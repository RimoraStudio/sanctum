import { registerCertificatesRouter } from "./deprecated-certificates-router";
import { registerDeprecatedSecretRouter } from "./deprecated-secret-router";
import { registerExternalMigrationRouter } from "./external-migration-router";
import { registerLoginRouter } from "./login-router";
import { registerSecretFileRouter } from "./secret-file-router";
import { registerSignupRouter } from "./signup-router";

export const registerV3Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSignupRouter, { prefix: "/signup" });
  await server.register(registerLoginRouter, { prefix: "/auth" });
  await server.register(registerDeprecatedSecretRouter, { prefix: "/secrets" });
  await server.register(registerSecretFileRouter, { prefix: "/files" });
  await server.register(registerExternalMigrationRouter, { prefix: "/external-migration" });
  await server.register(registerCertificatesRouter, { prefix: "/pki/certificates" });
};
