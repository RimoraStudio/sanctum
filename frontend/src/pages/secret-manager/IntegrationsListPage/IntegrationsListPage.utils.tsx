import { createNotification } from "@app/components/notifications";

export const createIntegrationMissingEnvVarsNotification = (
  _slug: string,
  _type: "cloud" | "cicd" = "cloud",
  hashtag?: string
) =>
  createNotification({
    type: "error",
    text: (
      <a
        href={`/docs${hashtag ? `#${hashtag}` : ""}`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Click here to view docs
      </a>
    ),
    title: "Missing Environment Variables"
  });
