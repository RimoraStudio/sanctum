import { Helmet } from "react-helmet";

import { KmipServerTab } from "./components";
import { envConfig } from "@app/config/env";

export const KmipServersPage = () => {
  return (
    <>
      <Helmet>
        <title>{envConfig.PLATFORM_NAME} | KMIP Servers</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <KmipServerTab />
        </div>
      </div>
    </>
  );
};
