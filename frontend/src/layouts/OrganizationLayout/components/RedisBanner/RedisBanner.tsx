import { OrgAlertBanner } from "../OrgAlertBanner";
import { envConfig } from "@app/config/env";

export const RedisBanner = () => {
  return (
    <OrgAlertBanner
      text={`Attention: Updated versions of ${envConfig.PLATFORM_NAME} now require Redis for full functionality.`}
      link="https://sanctum.com/docs/self-hosting/configuration/requirements#redis"
    />
  );
};
