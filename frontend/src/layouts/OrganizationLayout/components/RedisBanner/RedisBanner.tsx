import { OrgAlertBanner } from "../OrgAlertBanner";
import { envConfig } from "@app/config/env";

export const RedisBanner = () => {
  return (
    <OrgAlertBanner
      text={`Attention: Updated versions of ${envConfig.PLATFORM_NAME} now require Redis for full functionality.`}
      link="/docs#self-hosting"
    />
  );
};
