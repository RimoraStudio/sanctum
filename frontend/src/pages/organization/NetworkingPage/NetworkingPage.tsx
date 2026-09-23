import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useOrganization } from "@app/context";

import { NetworkingTabGroup } from "./components/NetworkingTabGroup/NetworkingTabGroup";

export const NetworkingPage = () => {
  const { isSubOrganization } = useOrganization();

  return (
    <>
      <Helmet>
        <title>{envConfig.PLATFORM_NAME} | Networking</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="Networking"
            description={`Manage gateways and relays that securely connect ${envConfig.PLATFORM_NAME} to your infrastructure`}
          />
          <NetworkingTabGroup />
        </div>
      </div>
    </>
  );
};
