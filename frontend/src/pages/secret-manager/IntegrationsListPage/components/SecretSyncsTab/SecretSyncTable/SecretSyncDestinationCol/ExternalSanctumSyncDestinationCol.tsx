import { TExternalSanctumSync } from "@app/hooks/api/secretSyncs/types/external-sanctum-sync";

import { getSecretSyncDestinationColValues } from "../helpers";
import { SecretSyncTableCell } from "../SecretSyncTableCell";

type Props = {
  secretSync: TExternalSanctumSync;
};

export const ExternalSanctumSyncDestinationCol = ({ secretSync }: Props) => {
  const { primaryText, secondaryText } = getSecretSyncDestinationColValues(secretSync);
  return <SecretSyncTableCell primaryText={primaryText} secondaryText={secondaryText} />;
};
