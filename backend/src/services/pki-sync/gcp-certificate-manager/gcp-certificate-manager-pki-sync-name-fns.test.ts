import {
  buildGcpCertificateResourceName,
  toGcpCertificateId,
  toGcpCertificateMapEntryId
} from "./gcp-certificate-manager-pki-sync-name-fns";

describe("toGcpCertificateId", () => {
  test("lowercases names the shared compiler leaves in mixed case", () => {
    expect(toGcpCertificateId("Sanctum-Web.Example.COM")).toBe("sanctum-web-example-com");
  });

  test("normalizes the legacy Sanctum-<id> fallback name", () => {
    const hex = "550e8400e29b41d4a716446655440000";
    expect(toGcpCertificateId(`Sanctum-${hex}`)).toBe(`sanctum-${hex}`);
  });

  test("replaces disallowed characters and collapses the result", () => {
    expect(toGcpCertificateId("sanctum_web..example")).toBe("sanctum-web-example");
    expect(toGcpCertificateId("sanctum/prod cert")).toBe("sanctum-prod-cert");
  });

  test("trims leading and trailing hyphens", () => {
    expect(toGcpCertificateId("--sanctum-cert--")).toBe("sanctum-cert");
    expect(toGcpCertificateId(".sanctum.")).toBe("sanctum");
  });

  test("shortens to 63 characters", () => {
    expect(toGcpCertificateId("a".repeat(80))).toHaveLength(63);
  });

  test("keeps the start of the name and replaces the end, not the other way round", () => {
    const tail = "550e8400e29b41d4a716446655440000";
    const shortened = toGcpCertificateId(`checkout-service-eu-west-1-payments-internal-example-com-${tail}`);

    expect(shortened).toBe("checkout-service-eu-west-1-payments-internal-example-c-3e574b24");
    expect(shortened).not.toContain(tail);
    expect(shortened.startsWith("checkout-service")).toBe(true);
  });

  test("keeps the leading letter and stays unique when the compiled name is too long", () => {
    const commonName = "a".repeat(58);
    const first = toGcpCertificateId(`sanctum-${commonName}-${"1".repeat(32)}`);
    const second = toGcpCertificateId(`sanctum-${commonName}-${"2".repeat(32)}`);

    // Two certificates must not collide on one GCP resource, which is what the digest suffix buys.
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThanOrEqual(63);
    expect(second.length).toBeLessThanOrEqual(63);
    // GCP rejects an ID that does not start with a letter, so the schema's prefix has to survive.
    expect(first.startsWith("sanctum-")).toBe(true);
    expect(second.startsWith("sanctum-")).toBe(true);
  });

  test("resolves a long name to the same ID every time, so re-syncs are idempotent", () => {
    const name = `sanctum-${"a".repeat(58)}-${"1".repeat(32)}`;
    expect(toGcpCertificateId(name)).toBe(toGcpCertificateId(name));
  });

  test("refuses a name that would produce an ID GCP rejects", () => {
    // A bare hex certificate ID starts with a digit most of the time; GCP requires a letter.
    expect(() => toGcpCertificateId("3f2a9c1d4e5b6a7c8d9e0f1a2b3c4d5e")).toThrow(/start with a letter/);
  });

  test("leaves an already valid ID untouched", () => {
    expect(toGcpCertificateId("sanctum-abc-123")).toBe("sanctum-abc-123");
  });

  test("throws when nothing usable survives normalization", () => {
    expect(() => toGcpCertificateId("!!!")).toThrow(/cannot be converted into a GCP Certificate Manager resource ID/);
    expect(() => toGcpCertificateId("")).toThrow();
  });
});

describe("toGcpCertificateMapEntryId", () => {
  test("derives a stable entry ID from the sync so renewals repoint one entry", () => {
    const syncId = "550e8400-e29b-41d4-a716-446655440000";
    expect(toGcpCertificateMapEntryId(syncId)).toBe("sanctum-550e8400-e29b-41d4-a716-446655440000");
    expect(toGcpCertificateMapEntryId(syncId)).toBe(toGcpCertificateMapEntryId(syncId));
  });

  test("stays inside GCP's 63 character limit", () => {
    expect(toGcpCertificateMapEntryId("550e8400-e29b-41d4-a716-446655440000").length).toBeLessThanOrEqual(63);
  });
});

describe("resource name builders", () => {
  test("builds a fully qualified certificate name", () => {
    expect(
      buildGcpCertificateResourceName({
        gcpProjectId: "my-prod-project",
        location: "global",
        certificateId: "sanctum-abc"
      })
    ).toBe("projects/my-prod-project/locations/global/certificates/sanctum-abc");
  });
});
