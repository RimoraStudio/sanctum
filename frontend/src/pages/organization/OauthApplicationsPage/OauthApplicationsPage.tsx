import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization } from "@app/context";
import { OrgOauthClientsTab } from "@app/pages/organization/SettingsPage/components/OrgOauthClientsTab";

export const OauthApplicationsPage = () => {
  const { isSubOrganization } = useOrganization();

  return (
    <>
      <Helmet>
        <title>{envConfig.PLATFORM_NAME} | OAuth Applications</title>
        <link rel="icon" href="/sanctum.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="OAuth Applications"
            description={`Control how external platforms access ${envConfig.PLATFORM_NAME} on behalf of your users via OAuth 2.0.`}
          />
          <OrgOauthClientsTab />
        </div>
      </div>
    </>
  );
};
