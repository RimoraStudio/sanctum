import { OrgAlertBanner } from "../OrgAlertBanner";

export const SmtpBanner = () => {
  return (
    <OrgAlertBanner text="Attention: SMTP has not been configured for this instance. Set the SMTP_* environment variables on the backend to enable email." />
  );
};
