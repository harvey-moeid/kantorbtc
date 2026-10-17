import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unstable_readConfig, type Unstable_Config } from "wrangler";

interface DeploymentOptions {
  target: string;
  databaseId: string;
  databaseName?: string;
  workerName?: string;
  root: string;
}

export function deploymentConfig(
  base: Unstable_Config,
  options: DeploymentOptions,
) {
  if (options.target !== "production")
    throw new Error("DEPLOY_ENVIRONMENT must be production.");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      options.databaseId,
    ) ||
    options.databaseId === "00000000-0000-0000-0000-000000000000"
  )
    throw new Error(
      "Set CLOUDFLARE_D1_DATABASE_ID to the target D1 database UUID.",
    );
  const workerName = options.workerName || base.name || "";
  const databaseName = options.databaseName || "kantor-db";
  for (const [field, value] of [
    ["CLOUDFLARE_WORKER_NAME", workerName],
    ["CLOUDFLARE_D1_DATABASE_NAME", databaseName],
  ]) {
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(value))
      throw new Error(
        `${field} must be a valid resource name (1–63 characters).`,
      );
  }
  if (
    !base.main ||
    !base.assets?.directory ||
    base.d1_databases.length !== 1 ||
    base.d1_databases[0].binding !== "DB"
  )
    throw new Error(
      "Expected one Worker entry, built assets and one DB binding.",
    );
  return {
    $schema: resolve(options.root, "node_modules/wrangler/config-schema.json"),
    name: workerName,
    main: resolve(options.root, base.main),
    compatibility_date: base.compatibility_date,
    compatibility_flags: base.compatibility_flags,
    assets: {
      ...base.assets,
      directory: resolve(options.root, base.assets.directory),
    },
    d1_databases: base.d1_databases.map((database) => ({
      ...database,
      database_id: options.databaseId,
      database_name: databaseName,
      migrations_dir: resolve(
        options.root,
        database.migrations_dir || "migrations",
      ),
    })),
    durable_objects: base.durable_objects,
    migrations: base.migrations,
    observability: base.observability,
    vars: { ...base.vars, APP_MODE: "live" },
    triggers: base.triggers,
    ...(base.ai ? { ai: base.ai } : {}),
  };
}

export function validateDeploymentCredentials(env: NodeJS.ProcessEnv) {
  if (!env.CLOUDFLARE_API_TOKEN)
    throw new Error(
      "Configure the CLOUDFLARE_API_TOKEN secret in the selected GitHub Environment.",
    );
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || ""))
    throw new Error(
      "Configure CLOUDFLARE_ACCOUNT_ID in the selected GitHub Environment.",
    );
  let health: URL;
  try {
    health = new URL(env.CLOUDFLARE_HEALTH_URL || "");
  } catch {
    throw new Error(
      "Configure CLOUDFLARE_HEALTH_URL as the deployed HTTPS /api/health URL.",
    );
  }
  if (
    health.protocol !== "https:" ||
    health.username ||
    health.password ||
    health.pathname !== "/api/health" ||
    health.search ||
    health.hash
  )
    throw new Error(
      "CLOUDFLARE_HEALTH_URL must be an HTTPS /api/health URL without credentials or query parameters.",
    );
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) validateDeploymentCredentials(process.env);
  const config = deploymentConfig(
    unstable_readConfig({ config: resolve(root, "wrangler.jsonc") }),
    {
      target: process.env.DEPLOY_ENVIRONMENT || "production",
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || "",
      databaseName: process.env.CLOUDFLARE_D1_DATABASE_NAME,
      workerName: process.env.CLOUDFLARE_WORKER_NAME,
      root,
    },
  );
  const output = resolve(root, ".wrangler/ci-deploy/wrangler.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    `Deployment config prepared for ${process.env.DEPLOY_ENVIRONMENT || "production"} in .wrangler/ci-deploy/wrangler.json.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
