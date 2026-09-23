import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TExternalSanctumSync } from "@app/hooks/api/secretSyncs/types/external-sanctum-sync";

type Props = {
  secretSync: TExternalSanctumSync;
};

export const ExternalSanctumSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project ID</DetailLabel>
        <DetailValue>{destinationConfig.projectId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{destinationConfig.environment}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret Path</DetailLabel>
        <DetailValue>{destinationConfig.secretPath}</DetailValue>
      </Detail>
    </>
  );
};
