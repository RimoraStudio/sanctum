import { OrgAlertBanner } from "../OrgAlertBanner";
import { envConfig } from "@app/config/env";

export const InsecureConnectionBanner = () => {
  return (
    <OrgAlertBanner
      text={`Your connection to this ${envConfig.PLATFORM_NAME} instance is not secured via HTTPS. Some features may not
        behave as expected.`}
    />
  );
};
