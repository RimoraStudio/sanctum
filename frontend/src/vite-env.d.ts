/// <reference types="vite/client" />
//
interface ImportMetaEnv {
  readonly VITE_POSTHOG_API_KEY?: string;
  readonly VITE_POSTHOG_HOST: string;
  readonly VITE_INTERCOM_ID?: string;
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_SANCTUM_PLATFORM_VERSION?: string;
  readonly VITE_PLATFORM_NAME?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
