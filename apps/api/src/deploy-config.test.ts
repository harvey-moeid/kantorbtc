import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { unstable_readConfig } from "wrangler";
import {
  deploymentConfig,
  validateDeploymentCredentials,
} from "../../../scripts/configure-deploy.mts";

const root = resolve(import.meta.dirname, "../../..");
const base = unstable_readConfig({ config: resolve(root, "wrangler.jsonc") });
const databaseId = "11111111-2222-4333-8444-555555555555";
const options = { target: "production", databaseId, root };

describe("Cloudflare deployment configuration", () => {
  it("resolves production resources and paths relative to the checkout", () => {
    const config = deploymentConfig(base, options);
    expect(config.name).toBe("kantor-trading");
    expect(config.main).toBe(resolve(root, "apps/api/src/index.ts"));
    expect(config.assets.directory).toBe(resolve(root, "dist"));
    expect(config.d1_databases[0]).toMatchObject({
      binding: "DB",
      database_name: "kantor-db",
      database_id: databaseId,
      migrations_dir: resolve(root, "apps/api/migrations"),
    });
    expect(config.ai).toMatchObject({ binding: "AI" });
    expect(config.vars.APP_MODE).toBe("live");
    expect(config.triggers).toEqual(base.triggers);
    expect(config.durable_objects).toEqual(base.durable_objects);
    expect(config.migrations).toEqual(base.migrations);
    expect(base.d1_databases[0].database_id).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
  });

  it("keeps production bindings and honors explicitly named resources", () => {
    const config = deploymentConfig(base, {
      ...options,
      target: "production",
      workerName: "kantor-prod",
      databaseName: "kantor-prod-db",
    });
    expect(config.name).toBe("kantor-prod");
    expect(config.d1_databases[0].database_name).toBe("kantor-prod-db");
    expect(config.triggers).toEqual(base.triggers);
    expect(config.vars.APP_MODE).toBe("live");
  });

  it("keeps production live when the base config uses demo", () => {
    const config = deploymentConfig(
      { ...base, vars: { ...base.vars, APP_MODE: "demo" } },
      options,
    );
    expect(config.vars.APP_MODE).toBe("live");
    expect(config.name).toBe("kantor-trading");
    expect(config.d1_databases[0].database_name).toBe("kantor-db");
  });

  it.each(["", "invalid", "00000000-0000-0000-0000-000000000000"])(
    "rejects unusable D1 ID %s",
    (id) => {
      expect(() =>
        deploymentConfig(base, { ...options, databaseId: id }),
      ).toThrow("CLOUDFLARE_D1_DATABASE_ID");
    },
  );

  it("rejects the removed staging target", () => {
    expect(() =>
      deploymentConfig(base, { ...options, target: "staging" }),
    ).toThrow("DEPLOY_ENVIRONMENT must be production");
  });

  it("rejects unexpected targets and invalid resource names", () => {
    expect(() =>
      deploymentConfig(base, { ...options, target: "preview" }),
    ).toThrow("DEPLOY_ENVIRONMENT");
    expect(() =>
      deploymentConfig(base, { ...options, workerName: "invalid name" }),
    ).toThrow("CLOUDFLARE_WORKER_NAME");
  });

  it("rejects a config missing the expected DB binding", () => {
    expect(() =>
      deploymentConfig({ ...base, d1_databases: [] }, options),
    ).toThrow("DB binding");
  });

  it("checks credential presence without copying values into the config", () => {
    const env = {
      CLOUDFLARE_API_TOKEN: "test-only",
      CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      CLOUDFLARE_HEALTH_URL: "https://kantor.example/api/health",
    };
    expect(() => validateDeploymentCredentials(env)).not.toThrow();
    expect(() =>
      validateDeploymentCredentials({ ...env, CLOUDFLARE_API_TOKEN: "" }),
    ).toThrow("CLOUDFLARE_API_TOKEN");
    expect(() =>
      validateDeploymentCredentials({ ...env, CLOUDFLARE_ACCOUNT_ID: "" }),
    ).toThrow("CLOUDFLARE_ACCOUNT_ID");
    expect(JSON.stringify(deploymentConfig(base, options))).not.toContain(
      env.CLOUDFLARE_API_TOKEN,
    );
  });

  it.each([
    "",
    "http://kantor.example/api/health",
    "https://user:password@kantor.example/api/health",
    "https://kantor.example/",
    "https://kantor.example/api/health?token=secret",
  ])("rejects invalid health URL %s", (url) => {
    expect(() =>
      validateDeploymentCredentials({
        CLOUDFLARE_API_TOKEN: "test-only",
        CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
        CLOUDFLARE_HEALTH_URL: url,
      }),
    ).toThrow("CLOUDFLARE_HEALTH_URL");
  });
});
