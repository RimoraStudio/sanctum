import { faDownload, faFile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Tooltip } from "@app/components/v2";
import { downloadBase64File } from "@app/helpers/download";

type SecretMetadataEntry = { key: string; value: string };

const meta = (metadata: SecretMetadataEntry[] | undefined, key: string) =>
  metadata?.find((m) => m.key === key)?.value;

export const isFileSecret = (secretMetadata?: SecretMetadataEntry[]) =>
  meta(secretMetadata, "kind") === "file";

const humanSize = (base64?: string) => {
  if (!base64) return null;
  const bytes = Math.floor((base64.replace(/=+$/, "").length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type Props = {
  secretMetadata?: SecretMetadataEntry[];
  /** current base64 value, if already fetched */
  base64Value?: string;
  /** fetch the value on demand then download as the original file */
  onDownload: () => Promise<string | undefined>;
  disabled?: boolean;
};

export const SecretFileValue = ({ secretMetadata, base64Value, onDownload, disabled }: Props) => {
  const localPath = meta(secretMetadata, "localPath");
  const sha = meta(secretMetadata, "sha256");
  const fileName = localPath?.split("/").pop() ?? "file";
  const size = humanSize(base64Value);

  const handleDownload = async () => {
    const value = await onDownload();
    if (value) downloadBase64File(fileName, value);
  };

  return (
    <div className="flex w-full items-center gap-2 px-1">
      <FontAwesomeIcon icon={faFile} className="text-mineshaft-300" />
      <div className="min-w-0 grow">
        <div className="truncate text-sm text-bunker-100" title={localPath ?? fileName}>
          {fileName}
        </div>
        <div className="truncate text-xs text-mineshaft-400">
          {[localPath, size, sha ? `sha256 ${sha.slice(0, 12)}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      <Tooltip content="Download file">
        <IconButton
          variant="plain"
          ariaLabel="download-file"
          className="h-full"
          isDisabled={disabled}
          onClick={handleDownload}
        >
          <FontAwesomeIcon icon={faDownload} />
        </IconButton>
      </Tooltip>
    </div>
  );
};
