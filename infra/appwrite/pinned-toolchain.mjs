import { existsSync, mkdirSync } from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  win32,
} from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NODE_VERSION = '24.21.0';
export const NPM_VERSION = '11.19.0';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function requiredAbsolutePath(value, name) {
  if (!value || !isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return value;
}

export function resolvePinnedPaths(env = process.env) {
  if (env.APPWRITE_NODE_VERSION && env.APPWRITE_NODE_VERSION !== NODE_VERSION) {
    throw new Error(
      `APPWRITE_NODE_VERSION must be ${NODE_VERSION}, not ${env.APPWRITE_NODE_VERSION}`,
    );
  }
  if (env.APPWRITE_NPM_VERSION && env.APPWRITE_NPM_VERSION !== NPM_VERSION) {
    throw new Error(
      `APPWRITE_NPM_VERSION must be ${NPM_VERSION}, not ${env.APPWRITE_NPM_VERSION}`,
    );
  }

  return {
    nodePath: requiredAbsolutePath(
      env.APPWRITE_PINNED_NODE,
      'APPWRITE_PINNED_NODE',
    ),
    npmCliPath: requiredAbsolutePath(
      env.APPWRITE_PINNED_NPM_CLI,
      'APPWRITE_PINNED_NPM_CLI',
    ),
  };
}

function platformDetails(platform, arch) {
  const details = {
    'win32/x64': { packageName: 'node-win-x64', binaryName: 'node.exe' },
    'linux/x64': { packageName: 'node-linux-x64', binaryName: 'node' },
    'linux/arm64': { packageName: 'node-linux-arm64', binaryName: 'node' },
  }[`${platform}/${arch}`];
  if (!details) {
    throw new Error(
      `Unsupported Node bootstrap platform/architecture: ${platform}/${arch}`,
    );
  }
  return details;
}

export function resolveToolchainPaths(
  nodePath,
  npmCliPath,
  pathValue,
  platform,
) {
  const pathApi = platform === 'win32' ? win32 : posix;
  const npmPackageDirectory = pathApi.dirname(
    pathApi.dirname(pathApi.dirname(npmCliPath)),
  );
  const npmWrapperDirectory = pathApi.join(npmPackageDirectory, '.bin');
  const nodeBinDirectory = pathApi.dirname(nodePath);
  return [npmWrapperDirectory, nodeBinDirectory, pathValue ?? '']
    .filter(Boolean)
    .join(platform === 'win32' ? ';' : ':');
}

export function bootstrapInstallSpec(
  platform = process.platform,
  arch = process.arch,
  prefix = toolchainPrefix(),
) {
  const { packageName, binaryName } = platformDetails(platform, arch);
  const pathApi = platform === 'win32' ? win32 : posix;
  return {
    packages: [`${packageName}@${NODE_VERSION}`, `npm@${NPM_VERSION}`],
    npmArgs: [
      'install',
      '--prefix',
      prefix,
      '--no-save',
      '--package-lock=false',
      '--ignore-scripts',
    ],
    nodePath: pathApi.join(
      prefix,
      'node_modules',
      packageName,
      'bin',
      binaryName,
    ),
    npmCliPath: pathApi.join(
      prefix,
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    ),
  };
}

function hostNpmCliPath() {
  const configured = process.env.npm_execpath;
  if (configured && isAbsolute(configured)) return configured;

  const nodeDirectory = dirname(process.execPath);
  const candidates = [
    join(nodeDirectory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(
      nodeDirectory,
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    ),
  ];
  const candidate = candidates.find((path) => existsSync(path));
  if (!candidate) {
    throw new Error(
      'Could not locate the host npm CLI; set APPWRITE_HOST_NPM to an absolute npm-cli.js path',
    );
  }
  return resolve(candidate);
}

function toolchainPrefix() {
  const prefix = resolve(
    process.env.APPWRITE_TOOLCHAIN_PREFIX ??
      join(tmpdir(), `intermed-node-${NODE_VERSION}-npm-${NPM_VERSION}`),
  );
  const relativePrefix = relative(repositoryRoot, prefix);
  if (
    !relativePrefix ||
    (!relativePrefix.startsWith('..') && !isAbsolute(relativePrefix))
  ) {
    throw new Error('APPWRITE_TOOLCHAIN_PREFIX must be outside the repository');
  }
  return prefix;
}

function bootstrapToolchain() {
  const prefix = toolchainPrefix();
  mkdirSync(prefix, { recursive: true });
  const hostNode = process.execPath;
  const hostNpm = process.env.APPWRITE_HOST_NPM
    ? requiredAbsolutePath(process.env.APPWRITE_HOST_NPM, 'APPWRITE_HOST_NPM')
    : hostNpmCliPath();

  const spec = bootstrapInstallSpec(process.platform, process.arch, prefix);
  const result = spawnSync(
    hostNode,
    [hostNpm, ...spec.npmArgs, ...spec.packages],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_AUDIT: 'false',
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Host npm failed to install the pinned toolchain (${result.status})`,
    );
  }

  return { nodePath: spec.nodePath, npmCliPath: spec.npmCliPath };
}

function resolveToolchain() {
  const injected =
    process.env.APPWRITE_PINNED_NODE || process.env.APPWRITE_PINNED_NPM_CLI;
  return injected ? resolvePinnedPaths() : bootstrapToolchain();
}

function verifyVersions(nodePath, npmCliPath) {
  const nodeVersion = execFileSync(nodePath, ['--version'], {
    encoding: 'utf8',
  }).trim();
  const npmVersion = execFileSync(nodePath, [npmCliPath, '--version'], {
    encoding: 'utf8',
  }).trim();
  if (nodeVersion !== `v${NODE_VERSION}` || npmVersion !== NPM_VERSION) {
    throw new Error(
      `Pinned toolchain mismatch: node ${nodeVersion}, npm ${npmVersion}; expected node v${NODE_VERSION}, npm ${NPM_VERSION}`,
    );
  }
  return { nodeVersion, npmVersion };
}

function run() {
  const command = process.argv[2];
  if (command !== 'install' && command !== 'build') {
    throw new Error(
      'Usage: node infra/appwrite/pinned-toolchain.mjs <install|build>',
    );
  }

  const { nodePath, npmCliPath } = resolveToolchain();
  const versions = verifyVersions(nodePath, npmCliPath);
  const args =
    command === 'install'
      ? [npmCliPath, 'ci', '--no-fund']
      : [npmCliPath, 'run', 'build', '--workspace', '@intermed/web'];
  const result = spawnSync(nodePath, args, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PATH: resolveToolchainPaths(
        nodePath,
        npmCliPath,
        process.env.PATH,
        process.platform,
      ),
      NPM_CONFIG_FUND: 'false',
    },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Pinned ${command} command failed (${result.status})`);
  }
  console.log(
    `Pinned ${command} succeeded with Node ${versions.nodeVersion} and npm ${versions.npmVersion}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
