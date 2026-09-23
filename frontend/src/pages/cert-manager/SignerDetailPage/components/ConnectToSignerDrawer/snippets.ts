import { envConfig } from "@app/config/env";
export type SnippetLanguage = "bash" | "powershell" | "text";

export type Snippet = {
  language: SnippetLanguage;
  code: string;
};

export type OS = "linux" | "macos" | "windows";
export type Pkcs11Tool = "jarsigner" | "osslsigncode" | "pkcs11-tool";

export type SignerAuth = { mode: "token"; token: string } | { mode: "machine-identity" };

const credLines = (auth: SignerAuth, shell: "powershell" | "bash"): string => {
  if (shell === "powershell") {
    return auth.mode === "token"
      ? `$env:SANCTUM_TOKEN = "${auth.token}"`
      : `$env:SANCTUM_UNIVERSAL_AUTH_CLIENT_ID = "<client-id>"
$env:SANCTUM_UNIVERSAL_AUTH_CLIENT_SECRET = "<client-secret>"`;
  }
  return auth.mode === "token"
    ? `export SANCTUM_TOKEN="${auth.token}"`
    : `export SANCTUM_UNIVERSAL_AUTH_CLIENT_ID="<client-id>"
export SANCTUM_UNIVERSAL_AUTH_CLIENT_SECRET="<client-secret>"`;
};

const PKCS11_RELEASES = "https://github.com/Sanctum/sanctum-pkcs-11/releases/latest/download";
const KSP_RELEASES = "https://github.com/Sanctum/sanctum-ksp/releases/latest/download";

const isEcdsa = (keyAlgorithm?: string | null) =>
  Boolean(keyAlgorithm && keyAlgorithm.toUpperCase().startsWith("EC"));

// jarsigner picks the signature algorithm from the key type.
const jarsignerSigAlg = (keyAlgorithm?: string | null) =>
  isEcdsa(keyAlgorithm) ? "SHA256withECDSA" : "SHA256withRSA";

// ---- Standard signing tools (PKCS#11) --------------------------------------

export const pkcs11InstallSnippet = (os: OS): Snippet => {
  switch (os) {
    case "linux":
      return {
        language: "bash",
        code: `curl -L -o libsanctum-pkcs11.tar.gz \\
  ${PKCS11_RELEASES}/libsanctum-pkcs11-linux-amd64.so.tar.gz
tar -xzf libsanctum-pkcs11.tar.gz`
      };
    case "macos":
      return {
        language: "bash",
        code: `curl -L -o libsanctum-pkcs11.tar.gz \\
  ${PKCS11_RELEASES}/libsanctum-pkcs11-darwin-arm64.dylib.tar.gz
tar -xzf libsanctum-pkcs11.tar.gz`
      };
    case "windows":
    default:
      return {
        language: "powershell",
        code: `Invoke-WebRequest \`
  -Uri "${PKCS11_RELEASES}/libsanctum-pkcs11-windows-amd64.dll.zip" \`
  -OutFile "libsanctum-pkcs11.zip"
Expand-Archive libsanctum-pkcs11.zip -DestinationPath . -Force`
      };
  }
};

export const pkcs11ConfigureSnippet = (os: OS, serverUrl: string, auth: SignerAuth): Snippet => {
  if (os === "windows") {
    return {
      language: "powershell",
      code: `New-Item -ItemType Directory -Force -Path "$env:ProgramData\\${envConfig.PLATFORM_NAME}" | Out-Null
'{ "server_url": "${serverUrl}" }' | Set-Content "$env:ProgramData\\${envConfig.PLATFORM_NAME}\\pkcs11.conf"
$env:SANCTUM_CONFIG = "$env:ProgramData\\${envConfig.PLATFORM_NAME}\\pkcs11.conf"
${credLines(auth, "powershell")}`
    };
  }
  return {
    language: "bash",
    code: `sudo mkdir -p /etc/sanctum
echo '{ "server_url": "${serverUrl}" }' | sudo tee /etc/sanctum/pkcs11.conf > /dev/null
${credLines(auth, "bash")}`
  };
};

export const jarsignerConfigSnippet = (os: OS): Snippet => {
  if (os === "windows") {
    return {
      language: "powershell",
      code: `@"
name = ${envConfig.PLATFORM_NAME}
library = C:/path/to/libsanctum-pkcs11.dll
"@ | Set-Content sanctum-pkcs11.cfg`
    };
  }
  const ext = os === "macos" ? "dylib" : "so";
  return {
    language: "bash",
    code: `cat > sanctum-pkcs11.cfg <<EOF
name = ${envConfig.PLATFORM_NAME}
library = /path/to/libsanctum-pkcs11.${ext}
EOF`
  };
};

export const pkcs11SignSnippet = (
  tool: Pkcs11Tool,
  signerName: string,
  keyAlgorithm?: string | null
): Snippet => {
  switch (tool) {
    case "jarsigner":
      return {
        language: "bash",
        code: `jarsigner -keystore NONE -storetype PKCS11 \\
  -addprovider SunPKCS11 -providerArg sanctum-pkcs11.cfg \\
  -sigalg ${jarsignerSigAlg(keyAlgorithm)} \\
  myapp.jar "${signerName}"`
      };
    case "osslsigncode":
      return {
        language: "bash",
        code: `osslsigncode sign \\
  -pkcs11module /path/to/libsanctum-pkcs11.so \\
  -pkcs11cert "pkcs11:object=${signerName};type=cert" \\
  -key "pkcs11:object=${signerName};type=private" \\
  -h sha256 \\
  -in MyApp.exe -out MyApp-signed.exe`
      };
    case "pkcs11-tool":
    default:
      return {
        language: "bash",
        code: "pkcs11-tool --module ./libsanctum-pkcs11.so --list-slots"
      };
  }
};

// ---- Windows signtool (native KSP) -----------------------------------------

export const kspDownloadSnippet = (): Snippet => ({
  language: "powershell",
  code: `Invoke-WebRequest -Uri "${KSP_RELEASES}/sanctum-ksp.dll" -OutFile "sanctum-ksp.dll"`
});

// Registering a CNG Key Storage Provider is a few registry entries plus dropping the DLL in
// System32.
export const kspRegisterSnippet = (): Snippet => ({
  language: "powershell",
  code: `$prov = "${envConfig.PLATFORM_NAME} Key Storage Provider"
$base = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Cryptography"
Copy-Item .\\sanctum-ksp.dll "$env:windir\\System32\\sanctum-ksp.dll" -Force
New-Item -Path "$base\\Providers\\$prov\\UM\\00010001" -Force | Out-Null
New-ItemProperty -Path "$base\\Providers\\$prov\\UM" -Name Image -PropertyType String -Value "sanctum-ksp.dll" -Force | Out-Null
Set-ItemProperty -Path "$base\\Providers\\$prov\\UM\\00010001" -Name "(default)" -Value "CRYPT_KEY_STORAGE_INTERFACE"
New-ItemProperty -Path "$base\\Providers\\$prov\\UM\\00010001" -Name Flags -PropertyType DWord -Value 0x10000 -Force | Out-Null
New-ItemProperty -Path "$base\\Providers\\$prov\\UM\\00010001" -Name Functions -PropertyType MultiString -Value @("KEY_STORAGE") -Force | Out-Null
$iface = "$base\\Configuration\\Local\\Default\\00010001\\KEY_STORAGE"
$cur = @((Get-ItemProperty $iface).Providers)
if ($cur -notcontains $prov) { Set-ItemProperty -Path $iface -Name Providers -Value ($cur + $prov) }`
});

export const kspConfigureSnippet = (serverUrl: string, auth: SignerAuth): Snippet => ({
  language: "powershell",
  code: `New-Item -ItemType Directory -Force -Path "$env:ProgramData\\${envConfig.PLATFORM_NAME}" | Out-Null
'{ "server_url": "${serverUrl}" }' | Set-Content "$env:ProgramData\\${envConfig.PLATFORM_NAME}\\config.json"
${credLines(auth, "powershell")}`
});

export const kspCertSnippet = (signerName: string, certPem?: string): Snippet => {
  const pem =
    certPem?.trim() ||
    `-----BEGIN CERTIFICATE-----
(loading this Signer's certificate...)
-----END CERTIFICATE-----`;
  return {
    language: "powershell",
    code: `$certPem = @"
${pem}
"@
Set-Content -Path "$env:ProgramData\\${envConfig.PLATFORM_NAME}\\${signerName}.cer" -Value $certPem -Encoding ascii`
  };
};

export const kspSignSnippet = (signerName: string): Snippet => ({
  language: "powershell",
  code: `signtool sign /fd SHA256 \`
  /f "$env:ProgramData\\${envConfig.PLATFORM_NAME}\\${signerName}.cer" \`
  /csp "${envConfig.PLATFORM_NAME} Key Storage Provider" /kc "${signerName}" \`
  MyApp.exe`
});
