export const isSanctumCloud = () =>
  window.location.origin.includes("https://app.sanctum.com") ||
  window.location.origin.includes("https://us.sanctum.com") ||
  window.location.origin.includes("https://eu.sanctum.com") ||
  window.location.origin.includes("https://gamma.sanctum.com");
