import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const browserGlobals = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'IDBDatabase',
  'IDBTransaction',
  'IDBObjectStore',
  'IDBRequest',
  'caches',
  'CacheStorage',
  'Storage',
  'Window',
  'Document',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
]);

/**
 * `@intermed/local-store` holds the Dexie repositories and the update
 * pipeline. It may use browser storage globals, but only the application
 * composition root and the test-only browser harness may construct it.
 */
const localStoreConsumers = [
  'apps/web/src/Bootstrap.tsx',
  'apps/web/src/dev/',
  'packages/local-store/',
];

function isLocalStoreConsumer(path) {
  return localStoreConsumers.some(
    (allowed) => path === allowed || path.startsWith(allowed),
  );
}

/**
 * Inspect source records with repository-relative paths for boundary violations.
 * Return diagnostics for private package imports, outward domain imports,
 * computed imports and browser/network identifiers in domain code.
 */
export function inspectBoundary(files) {
  const violations = [];
  for (const { path, source } of files) {
    const normalized = path.replaceAll('\\', '/');
    const inDomain = normalized.startsWith('packages/domain/');
    const inImporter = normalized.startsWith('packages/importer/');
    const ownPackage = normalized.match(/^packages\/([^/]+)\//)?.[1];
    const syntax = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const report = (message) => violations.push(`${path}: ${message}`);
    const checkImport = (specifier) => {
      if (
        specifier.startsWith('@intermed/') &&
        specifier.split('/').length !== 2
      ) {
        report(`use the public package export: ${specifier}`);
      }
      if (
        specifier === '@intermed/local-store' &&
        !isLocalStoreConsumer(normalized)
      )
        report(
          'local-store is reserved for the app composition root and the test-only harness',
        );
      if (specifier.startsWith('.')) {
        const target = relative(
          root,
          resolve(root, dirname(normalized), specifier),
        ).replaceAll('\\', '/');
        if (inDomain && !target.startsWith('packages/domain/src/'))
          report(`domain imports outward: ${specifier}`);
        const targetPackage = target.match(/^packages\/([^/]+)\//)?.[1];
        if (targetPackage && targetPackage !== ownPackage)
          report(`cross-package imports must use public exports: ${specifier}`);
      } else if (inDomain) {
        report(`domain must remain dependency-free: ${specifier}`);
      } else if (inImporter) {
        if (
          specifier === 'appwrite' ||
          specifier.startsWith('node:fs') ||
          specifier === 'fs' ||
          specifier.includes('sdk')
        ) {
          report(`importer must not reach SDK/fetch/fs: ${specifier}`);
        }
      }
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        checkImport(node.moduleSpecifier.text);
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        checkImport(node.argument.literal.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'))
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) checkImport(arg.text);
        else report('computed imports cannot be audited');
      }
      if (
        (inDomain || inImporter) &&
        ts.isIdentifier(node) &&
        browserGlobals.has(node.text)
      )
        report(`domain/importer uses browser/network identifier: ${node.text}`);
      ts.forEachChild(node, visit);
    };
    visit(syntax);
  }
  return violations;
}

/**
 * @param {string} directory
 * @returns {Promise<Array<{path: string, source: string}>>}
 */
export async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name))
      files.push({
        path: relative(root, path),
        source: await readFile(path, 'utf8'),
      });
  }
  return files;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const files = [
    ...(await sourceFiles(resolve(root, 'apps'))),
    ...(await sourceFiles(resolve(root, 'packages'))),
  ];
  const violations = inspectBoundary(files);
  const manifest = JSON.parse(
    await readFile(resolve(root, 'packages/domain/package.json'), 'utf8'),
  );
  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    if (Object.keys(manifest[field] ?? {}).length)
      violations.push(`domain ${field} must remain empty`);
  }
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      `Architecture boundaries passed (${files.length} source files; dependency-free domain; local-store confined to the composition root).`,
    );
}
