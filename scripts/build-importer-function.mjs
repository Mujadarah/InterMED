import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isBuiltin } from 'node:module';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(rootDir, 'packages');
const defaultFunctionSourceDir = join(
  rootDir,
  'infra',
  'appwrite',
  'functions',
  'import-anmdmr',
  'src',
);
const packageNames = ['domain', 'data-access', 'importer'];

/**
 * Exact runtime version pins for the only external dependencies the artifact
 * closure may contain. Anything else fails the build closed.
 */
const runtimeDependencyPins = { zod: '4.6.5' };

const compileOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: false,
  declaration: false,
  sourceMap: false,
  rootDir: packagesDir,
  baseUrl: rootDir,
  paths: {
    '@intermed/domain': ['packages/domain/src/index.ts'],
    '@intermed/data-access': ['packages/data-access/src/index.ts'],
    '@intermed/importer': ['packages/importer/src/index.ts'],
  },
  skipLibCheck: true,
  noEmitOnError: true,
};

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (
      entry.isFile() &&
      path.endsWith('.ts') &&
      !path.endsWith('.test.ts')
    )
      files.push(path);
  }
  return files;
}

function diagnosticsMessage(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => rootDir,
    getNewLine: () => '\n',
  });
}

function hasModifier(node, kind) {
  return (node.modifiers ?? []).some((modifier) => modifier.kind === kind);
}

function isTypeOnlyImportElement(element) {
  return element.isTypeOnly === true;
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('.') || isAbsolute(specifier);
}

function isInside(child, parent) {
  const childPath = resolve(child);
  const parentPath = resolve(parent);
  return childPath.startsWith(`${parentPath}${sep}`);
}

function assertInside(child, parent) {
  const childPath = resolve(child);
  const parentPath = resolve(parent);
  if (!childPath.startsWith(`${parentPath}${sep}`)) {
    throw new Error(
      `Refusing to operate outside staging directory: ${childPath}`,
    );
  }
}

function pinOf(specifier) {
  const pin = runtimeDependencyPins[specifier];
  if (typeof pin !== 'string') {
    throw new Error(
      `No exact runtime pin for external dependency '${specifier}'`,
    );
  }
  return pin;
}

/** Identifiers referenced per top-level statement (conservative keep rule). */
function identifiersByStatement(sourceFile) {
  return sourceFile.statements.map((statement) => {
    const names = new Set();
    const visit = (node) => {
      if (ts.isIdentifier(node)) names.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(statement);
    return names;
  });
}

/** Collect the runtime (value) module edges of one ES module AST. */
function collectModuleFacts(sourceFile) {
  const facts = {
    file: resolve(sourceFile.fileName),
    isBarrel: false,
    localExports: new Map(),
    localListNames: new Set(),
    reexports: [],
    imports: [],
    dynamicImports: [],
    computedDynamicImports: [],
  };

  sourceFile.statements.forEach((statement, statementIndex) => {
    if (ts.isImportDeclaration(statement)) {
      if (
        statement.importClause?.isTypeOnly === true ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        return;
      const specifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (!importClause) {
        facts.imports.push({ specifier, names: [], sideEffect: true });
        return;
      }
      const names = [];
      if (importClause.name) names.push('default');
      const bindings = importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        facts.imports.push({ specifier, names: null, sideEffect: false });
      } else if (bindings) {
        for (const element of bindings.elements) {
          if (isTypeOnlyImportElement(element)) continue;
          names.push((element.propertyName ?? element.name).text);
        }
        // `import { type X } from` is fully erased by the compiler.
        if (
          names.length === 0 &&
          !importClause.name &&
          bindings.elements.length > 0
        )
          return;
        facts.imports.push({ specifier, names, sideEffect: false });
      } else {
        facts.imports.push({ specifier, names, sideEffect: false });
      }
      return;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) return;
      const moduleSpecifier = statement.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        facts.isBarrel = true;
        const specifier = moduleSpecifier.text;
        const exportClause = statement.exportClause;
        if (!exportClause) {
          facts.reexports.push({
            kind: 'star',
            specifier,
            ns: null,
            elements: [],
            statementIndex,
            keep: false,
          });
        } else if (ts.isNamespaceExport(exportClause)) {
          facts.reexports.push({
            kind: 'starns',
            specifier,
            ns: exportClause.name.text,
            elements: [],
            statementIndex,
            keep: false,
          });
        } else {
          const elements = exportClause.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => ({
              surface: element.name.text,
              source: (element.propertyName ?? element.name).text,
            }));
          if (elements.length === 0) return;
          facts.reexports.push({
            kind: 'named',
            specifier,
            ns: null,
            elements,
            statementIndex,
            keep: false,
          });
        }
        return;
      }
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly) continue;
          facts.localListNames.add(element.name.text);
        }
      }
      return;
    }

    if (ts.isExportAssignment(statement)) {
      facts.localExports.set('default', { keep: true, statementIndex });
      return;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) return;
    const names = [];
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name))
          names.push(declaration.name.text);
      }
    } else if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      names.push(statement.name.text);
    }
    for (const name of names) {
      facts.localExports.set(name, { keep: true, statementIndex });
    }
  });

  const collectDynamic = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        facts.dynamicImports.push(node.arguments[0].text);
      } else {
        // Computed specifiers cannot be closed over; they are rejected at
        // build time instead of being silently omitted.
        facts.computedDynamicImports.push(true);
      }
    }
    ts.forEachChild(node, collectDynamic);
  };
  ts.forEachChild(sourceFile, collectDynamic);

  if (facts.isBarrel) {
    // Barrel-local exports are only kept when something inside the module
    // still references them; demanded names are flipped back on later.
    const identifiers = identifiersByStatement(sourceFile);
    for (const [name, record] of facts.localExports) {
      record.keep = identifiers.some(
        (statementIdentifiers, statementIndex) =>
          statementIndex !== record.statementIndex &&
          statementIdentifiers.has(name),
      );
    }
  }

  return facts;
}

function rewriteSpecifier(filePath, specifier) {
  if (!isRelativeSpecifier(specifier)) return specifier;
  if (
    extname(specifier) === '.js' ||
    extname(specifier) === '.mjs' ||
    extname(specifier) === '.cjs'
  ) {
    return specifier;
  }
  const candidate = resolve(dirname(filePath), `${specifier}.js`);
  const indexCandidate = resolve(dirname(filePath), specifier, 'index.js');
  if (existsSync(candidate)) return `${specifier}.js`;
  if (existsSync(indexCandidate)) return `${specifier}/index.js`;
  return specifier;
}

/**
 * Rewrite relative ESM specifiers to explicit `.js` paths via the TypeScript
 * AST and, when a decision map is given, drop barrel export statements whose
 * targets are outside the derived runtime closure.
 */
function transformJavaScript(filePath, decisions) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );

  const lookupReexport = (node) => {
    const specifier = node.moduleSpecifier.text;
    if (!node.exportClause) {
      const record = decisions.reexportsByKey.get(`star:${specifier}`);
      if (!record) throw new Error(`Unplanned export * from '${specifier}'`);
      return record;
    }
    if (ts.isNamespaceExport(node.exportClause)) {
      const ns = node.exportClause.name.text;
      const record = decisions.reexportsByKey.get(
        `starns:${specifier}\u0000${ns}`,
      );
      if (!record)
        throw new Error(`Unplanned export * as ${ns} from '${specifier}'`);
      return record;
    }
    const names = node.exportClause.elements.map(
      (element) => element.name.text,
    );
    const key = `exp:${specifier}\u0000${[...names].sort().join(',')}`;
    const record = decisions.reexportsByKey.get(key);
    if (record) return record;
    const subset = decisions.namedReexports.find(
      (candidate) =>
        candidate.specifier === specifier &&
        names.every((name) => candidate.names.has(name)),
    );
    if (subset) return subset.record;
    throw new Error(
      `Unplanned export { ${names.join(', ')} } from '${specifier}'`,
    );
  };

  const result = ts.transform(sourceFile, [
    (context) => {
      const visit = (node) => {
        if (
          ts.isImportDeclaration(node) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const next = rewriteSpecifier(filePath, node.moduleSpecifier.text);
          if (next === node.moduleSpecifier.text) return node;
          return ts.factory.updateImportDeclaration(
            node,
            node.modifiers,
            node.importClause,
            ts.factory.createStringLiteral(next),
            node.attributes,
          );
        }
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          if (decisions && !lookupReexport(node).keep) return undefined;
          const next = rewriteSpecifier(filePath, node.moduleSpecifier.text);
          if (next === node.moduleSpecifier.text) return node;
          return ts.factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            ts.factory.createStringLiteral(next),
            node.attributes,
          );
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const next = rewriteSpecifier(filePath, node.arguments[0].text);
          if (next === node.arguments[0].text) return node;
          return ts.factory.updateCallExpression(
            node,
            node.expression,
            node.typeArguments,
            [ts.factory.createStringLiteral(next), ...node.arguments.slice(1)],
          );
        }
        if (decisions) {
          const exported =
            (ts.isFunctionDeclaration(node) ||
              ts.isClassDeclaration(node) ||
              ts.isEnumDeclaration(node)) &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
            !hasModifier(node, ts.SyntaxKind.DefaultKeyword);
          if (exported && node.name) {
            const record = decisions.locals.get(node.name.text);
            if (record && !record.keep) return undefined;
          }
          if (
            ts.isVariableStatement(node) &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword)
          ) {
            const kept = node.declarationList.declarations.filter(
              (declaration) => {
                if (!ts.isIdentifier(declaration.name)) return true;
                const record = decisions.locals.get(declaration.name.text);
                return !record || record.keep;
              },
            );
            if (kept.length === 0) return undefined;
            if (kept.length !== node.declarationList.declarations.length) {
              return ts.factory.updateVariableStatement(
                node,
                node.modifiers,
                ts.factory.updateVariableDeclarationList(
                  node.declarationList,
                  kept,
                ),
              );
            }
          }
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);

  const printed = ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printFile(result.transformed[0]);
  writeFileSync(filePath, `${printed.trimEnd()}\n`);
  result.dispose();
}

function buildDecisions(facts) {
  const reexportsByKey = new Map();
  const namedReexports = [];
  for (const record of facts.reexports) {
    if (record.kind === 'star') {
      reexportsByKey.set(`star:${record.specifier}`, record);
    } else if (record.kind === 'starns') {
      reexportsByKey.set(
        `starns:${record.specifier}\u0000${record.ns}`,
        record,
      );
    } else {
      const names = [
        ...record.elements.map((element) => element.surface),
      ].sort();
      reexportsByKey.set(
        `exp:${record.specifier}\u0000${names.join(',')}`,
        record,
      );
      namedReexports.push({
        specifier: record.specifier,
        names: new Set(names),
        record,
      });
    }
  }
  return { locals: facts.localExports, reexportsByKey, namedReexports };
}

/**
 * Derive the actual transitive runtime closure of the artifact from the
 * function entry, using TypeScript module resolution and AST edges. Barrel
 * `export ... from` edges are only followed for bindings that are actually
 * demanded, so unrelated exports cannot drag mocks or fixtures into the
 * artifact.
 */
function analyzeRuntimeClosure({ program, functionFacts }) {
  const sourceByPath = new Map();
  for (const sourceFile of program.getSourceFiles()) {
    sourceByPath.set(resolve(sourceFile.fileName), sourceFile);
  }

  const factsCache = new Map();
  const resolutionCache = new Map();
  const exportsOfCache = new Map();
  const exportsOfVisiting = new Set();
  const included = new Set();
  const demands = new Map();
  const pending = [];

  const factsOf = (file) => {
    const key = resolve(file);
    let facts = factsCache.get(key);
    if (!facts) {
      const sourceFile = sourceByPath.get(key);
      if (!sourceFile) {
        throw new Error(`Artifact closure hit a non-declared module: ${key}`);
      }
      facts = collectModuleFacts(sourceFile);
      factsCache.set(key, facts);
    }
    return facts;
  };

  const resolveSpecifier = (fromFile, specifier) => {
    const cacheKey = `${resolve(fromFile)}\u0000${specifier}`;
    if (resolutionCache.has(cacheKey)) return resolutionCache.get(cacheKey);
    let resolved;
    if (isBuiltin(specifier) || specifier.startsWith('node:')) {
      resolved = { kind: 'builtin' };
    } else if (isRelativeSpecifier(specifier)) {
      const result = ts.resolveModuleName(
        specifier,
        fromFile,
        compileOptions,
        ts.sys,
      ).resolvedModule;
      if (!result) {
        throw new Error(`Cannot resolve '${specifier}' from ${fromFile}`);
      }
      resolved = classifyWorkspaceFile(result.resolvedFileName, specifier);
    } else if (specifier.startsWith('@intermed/')) {
      const result = ts.resolveModuleName(
        specifier,
        fromFile,
        compileOptions,
        ts.sys,
      ).resolvedModule;
      if (!result) {
        throw new Error(`Cannot resolve '${specifier}' from ${fromFile}`);
      }
      resolved = classifyWorkspaceFile(result.resolvedFileName, specifier);
    } else {
      pinOf(specifier);
      resolved = { kind: 'external', specifier };
    }
    resolutionCache.set(cacheKey, resolved);
    return resolved;
  };

  const classifyWorkspaceFile = (resolvedFileName, specifier) => {
    const file = resolve(resolvedFileName);
    if (
      !isInside(file, packagesDir) ||
      !file.endsWith('.ts') ||
      file.endsWith('.d.ts') ||
      file.endsWith('.test.ts')
    ) {
      throw new Error(
        `Workspace specifier '${specifier}' resolved outside package sources: ${file}`,
      );
    }
    return { kind: 'workspace', file };
  };

  const resolveReexportTarget = (fromFile, record) => {
    const key = `${resolve(fromFile)}\u0000reexport\u0000${record.statementIndex}`;
    if (resolutionCache.has(key)) return resolutionCache.get(key);
    const resolved = resolveSpecifier(fromFile, record.specifier);
    if (resolved.kind !== 'workspace') {
      throw new Error(
        `Re-export target '${record.specifier}' is not a workspace module`,
      );
    }
    resolutionCache.set(key, resolved);
    return resolved;
  };

  const exportsOf = (file) => {
    const key = resolve(file);
    if (exportsOfCache.has(key)) return exportsOfCache.get(key);
    if (exportsOfVisiting.has(key)) {
      throw new Error(`Cyclic re-export chain through ${key}`);
    }
    exportsOfVisiting.add(key);
    const facts = factsOf(file);
    const names = new Set(facts.localExports.keys());
    for (const name of facts.localListNames) names.add(name);
    for (const record of facts.reexports) {
      if (record.kind === 'named') {
        for (const element of record.elements) names.add(element.surface);
      } else if (record.kind === 'starns') {
        names.add(record.ns);
      } else {
        const target = resolveReexportTarget(file, record);
        for (const name of exportsOf(target.file)) names.add(name);
      }
    }
    exportsOfVisiting.delete(key);
    exportsOfCache.set(key, names);
    return names;
  };

  const demand = (file, name) => {
    const key = resolve(file);
    let names = demands.get(key);
    if (!names) {
      names = new Set();
      demands.set(key, names);
    }
    if (names.has(name)) return;
    names.add(name);
    pending.push([key, name]);
  };

  const demandAll = (file) => {
    for (const name of exportsOf(file)) demand(file, name);
  };

  const include = (file) => {
    const key = resolve(file);
    if (included.has(key)) return;
    included.add(key);
    const facts = factsOf(key);
    for (const edge of facts.imports) {
      const resolved = resolveSpecifier(key, edge.specifier);
      if (resolved.kind !== 'workspace') continue;
      include(resolved.file);
      if (edge.names === null) demandAll(resolved.file);
      else for (const name of edge.names) demand(resolved.file, name);
    }
    for (const specifier of facts.dynamicImports) {
      const resolved = resolveSpecifier(key, specifier);
      if (resolved.kind !== 'workspace') continue;
      include(resolved.file);
      demandAll(resolved.file);
    }
  };

  const resolveProvider = (file, name) => {
    const facts = factsOf(file);
    const local = facts.localExports.get(name);
    if (local) {
      local.keep = true;
      include(file);
      return;
    }
    if (facts.localListNames.has(name)) {
      include(file);
      return;
    }
    let found = false;
    for (const record of facts.reexports) {
      if (record.kind === 'named') {
        if (!record.elements.some((element) => element.surface === name))
          continue;
        found = true;
        record.keep = true;
        const target = resolveReexportTarget(file, record);
        include(target.file);
        // The kept statement re-exports every name, so all must exist at runtime.
        for (const element of record.elements)
          demand(target.file, element.source);
      } else if (record.kind === 'starns') {
        if (record.ns !== name) continue;
        found = true;
        record.keep = true;
        const target = resolveReexportTarget(file, record);
        include(target.file);
        demandAll(target.file);
      } else {
        const target = resolveReexportTarget(file, record);
        if (!exportsOf(target.file).has(name)) continue;
        found = true;
        record.keep = true;
        include(target.file);
        demand(target.file, name);
      }
    }
    if (!found) {
      throw new Error(`Cannot resolve runtime export '${name}' of ${file}`);
    }
  };

  // Seed the closure with the real function entry and its JS helpers.
  for (const facts of functionFacts) {
    for (const edge of facts.imports) {
      if (isRelativeSpecifier(edge.specifier)) continue;
      const resolved = resolveSpecifier(facts.file, edge.specifier);
      if (resolved.kind !== 'workspace') continue;
      include(resolved.file);
      if (edge.names === null) demandAll(resolved.file);
      else for (const name of edge.names) demand(resolved.file, name);
    }
    for (const specifier of facts.dynamicImports) {
      if (isRelativeSpecifier(specifier)) continue;
      const resolved = resolveSpecifier(facts.file, specifier);
      if (resolved.kind !== 'workspace') continue;
      include(resolved.file);
      demandAll(resolved.file);
    }
  }

  while (pending.length > 0) {
    const [file, name] = pending.shift();
    resolveProvider(file, name);
  }

  for (const file of included) {
    if (factsOf(file).computedDynamicImports.length > 0) {
      throw new Error(`Unsupported computed dynamic import in ${file}`);
    }
  }

  return { included, factsOf, resolveSpecifier, demands };
}

function packageNameOfFile(file) {
  const rel = relative(packagesDir, file);
  const packageName = rel.split(/[\\/]/)[0];
  if (!packageNames.includes(packageName)) {
    throw new Error(`Unexpected package for closure module: ${file}`);
  }
  return packageName;
}

function writeManifest(directory, manifest) {
  writeFileSync(
    join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: manifest.name,
        version: '0.0.0',
        private: false,
        type: 'module',
        main: './src/index.js',
        exports: { '.': './src/index.js' },
        dependencies: manifest.dependencies,
      },
      null,
      2,
    )}\n`,
  );
}

function keptBareSpecifiers(facts) {
  const specifiers = new Set();
  for (const edge of facts.imports) {
    if (!isRelativeSpecifier(edge.specifier)) specifiers.add(edge.specifier);
  }
  for (const specifier of facts.dynamicImports) {
    if (!isRelativeSpecifier(specifier)) specifiers.add(specifier);
  }
  for (const record of facts.reexports) {
    if (record.keep && !isRelativeSpecifier(record.specifier)) {
      specifiers.add(record.specifier);
    }
  }
  return specifiers;
}

/** Function JS files ship verbatim, so all of their bare specifiers count. */
function functionBareSpecifiers(facts) {
  const specifiers = new Set();
  for (const edge of facts.imports) {
    if (!isRelativeSpecifier(edge.specifier)) specifiers.add(edge.specifier);
  }
  for (const specifier of facts.dynamicImports) {
    if (!isRelativeSpecifier(specifier)) specifiers.add(specifier);
  }
  for (const record of facts.reexports) {
    if (!isRelativeSpecifier(record.specifier))
      specifiers.add(record.specifier);
  }
  return specifiers;
}

function collectFunctionGraph(functionSourceDir) {
  const entry = join(functionSourceDir, 'main.js');
  if (!existsSync(entry)) {
    throw new Error(`Function entry not found: ${entry}`);
  }
  const files = new Map();
  const factsList = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = resolve(queue.pop());
    const rel = relative(functionSourceDir, file).replaceAll('\\', '/');
    if (files.has(rel)) continue;
    if (!isInside(file, functionSourceDir)) {
      throw new Error(`Function helper escapes its source dir: ${file}`);
    }
    files.set(rel, file);
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.JS,
    );
    const facts = collectModuleFacts(sourceFile);
    if (facts.computedDynamicImports.length > 0) {
      throw new Error(`Unsupported computed dynamic import in ${file}`);
    }
    factsList.push(facts);
    const relativeSpecifiers = [
      ...facts.imports.map((edge) => edge.specifier),
      ...facts.reexports.map((record) => record.specifier),
      ...facts.dynamicImports,
    ];
    for (const specifier of relativeSpecifiers) {
      if (!isRelativeSpecifier(specifier)) continue;
      const target = resolveFunctionRelative(
        functionSourceDir,
        file,
        specifier,
      );
      const targetRel = relative(functionSourceDir, target).replaceAll(
        '\\',
        '/',
      );
      if (!files.has(targetRel)) queue.push(target);
    }
  }
  return { files, factsList };
}

function resolveFunctionRelative(functionSourceDir, fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      if (!isInside(candidate, functionSourceDir)) {
        throw new Error(`Function helper escapes its source dir: ${candidate}`);
      }
      return candidate;
    }
  }
  throw new Error(
    `Cannot resolve function helper '${specifier}' from ${fromFile}`,
  );
}

function compilePackages(staging) {
  const compileDir = join(staging, '.compiled');
  const files = packageNames.flatMap((name) =>
    sourceFiles(join(packagesDir, name, 'src')),
  );
  const program = ts.createProgram(files, {
    ...compileOptions,
    outDir: compileDir,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) throw new Error(diagnosticsMessage(diagnostics));
  const emitResult = program.emit();
  if (emitResult.emitSkipped)
    throw new Error('TypeScript did not emit the artifact');
  return { program, compileDir };
}

function emitVendorTree(staging, compileDir, closure) {
  const packagesInClosure = new Map();
  for (const file of closure.included) {
    const packageName = packageNameOfFile(file);
    if (!packagesInClosure.has(packageName)) {
      packagesInClosure.set(packageName, []);
    }
    packagesInClosure.get(packageName).push(file);
  }

  const transforms = [];
  for (const [packageName, packageFiles] of packagesInClosure) {
    const vendorPackage = join(staging, 'vendor', '@intermed', packageName);
    mkdirSync(vendorPackage, { recursive: true });
    const dependencies = {};
    for (const file of packageFiles) {
      const rel = relative(packagesDir, file).replaceAll('\\', '/');
      const compiledRel = rel.replace(/\.ts$/, '.js');
      const compiledFile = join(compileDir, compiledRel);
      if (!existsSync(compiledFile)) {
        throw new Error(`Missing compiled output for ${file}`);
      }
      const destination = join(
        vendorPackage,
        relative(join(packagesDir, packageName), file)
          .replaceAll('\\', '/')
          .replace(/\.ts$/, '.js'),
      );
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(compiledFile, destination);
      const facts = closure.factsOf(file);
      transforms.push({ destination, facts });
      for (const specifier of keptBareSpecifiers(facts)) {
        if (specifier.startsWith('@intermed/')) {
          const dependency = specifier.slice('@intermed/'.length);
          if (dependency !== packageName) {
            dependencies[specifier] = `file:../${dependency}`;
          }
        } else if (!isBuiltin(specifier) && !specifier.startsWith('node:')) {
          dependencies[specifier] = pinOf(specifier);
        }
      }
    }
    const entryIndex = `${packageName}/src/index.ts`;
    if (
      !packageFiles.some(
        (file) =>
          relative(packagesDir, file).replaceAll('\\', '/') === entryIndex,
      )
    ) {
      throw new Error(`Package @intermed/${packageName} lost its public entry`);
    }
    for (const specifier of Object.keys(dependencies)) {
      if (!specifier.startsWith('@intermed/')) continue;
      const dependency = specifier.slice('@intermed/'.length);
      if (!packagesInClosure.has(dependency)) {
        throw new Error(
          `Package @intermed/${packageName} depends on missing @intermed/${dependency}`,
        );
      }
    }
    writeManifest(vendorPackage, {
      name: `@intermed/${packageName}`,
      dependencies: Object.fromEntries(
        Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
      ),
    });
    assertInside(vendorPackage, staging);
  }

  // Second pass: every sibling is in place, so relative specifiers can be
  // resolved against the real artifact layout while rewriting.
  for (const { destination, facts } of transforms) {
    transformJavaScript(destination, buildDecisions(facts));
  }
  return packagesInClosure;
}

function writeRootPackage(staging, closure, functionFacts, packagesInClosure) {
  const dependencies = {};
  for (const facts of functionFacts) {
    for (const specifier of functionBareSpecifiers(facts)) {
      if (specifier.startsWith('@intermed/')) {
        const packageName = specifier.slice('@intermed/'.length);
        if (!packagesInClosure.has(packageName)) {
          throw new Error(`Function needs missing @intermed/${packageName}`);
        }
        dependencies[specifier] = `file:vendor/@intermed/${packageName}`;
      } else if (!isBuiltin(specifier) && !specifier.startsWith('node:')) {
        // Function-direct external imports need an exact root pin (W3).
        dependencies[specifier] = pinOf(specifier);
      }
    }
  }
  for (const file of closure.included) {
    for (const specifier of keptBareSpecifiers(closure.factsOf(file))) {
      if (
        specifier.startsWith('@intermed/') ||
        isBuiltin(specifier) ||
        specifier.startsWith('node:')
      )
        continue;
      dependencies[specifier] = pinOf(specifier);
    }
  }
  writeFileSync(
    join(staging, 'package.json'),
    `${JSON.stringify(
      {
        name: 'intermed-import-anmdmr',
        version: '1.0.0',
        private: true,
        type: 'module',
        main: './src/main.js',
        dependencies: Object.fromEntries(
          Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      null,
      2,
    )}\n`,
  );
}

function installRuntimeLock(staging) {
  const configuredNpm = process.env.npm_execpath;
  const bundledNpm = join(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const npm = configuredNpm ?? (existsSync(bundledNpm) ? bundledNpm : 'npm');
  const command = npm.endsWith('.js') ? process.execPath : npm;
  const args = npm.endsWith('.js') ? [npm] : [];
  execFileSync(
    command,
    [
      ...args,
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--offline',
    ],
    {
      cwd: staging,
      stdio: 'pipe',
    },
  );
}

/**
 * Build a self-contained Appwrite Function artifact for import-anmdmr.
 * Allocates a unique mkdtemp child under the optional output parent and never
 * deletes unrelated sibling paths. On success the staging directory is kept.
 *
 * The vendor tree is the derived transitive runtime closure of the real
 * function entry (and its relative JS helpers): barrel re-exports that nothing
 * demands are dropped, so mocks, fixtures and in-memory sources cannot leak
 * into the artifact.
 *
 * @param {{ outputParent?: string, functionSourceDir?: string }} [options]
 * @returns {string} Absolute path of the preserved artifact directory
 */
export function buildImporterFunctionArtifact(options = {}) {
  const outputParent =
    typeof options.outputParent === 'string' ? options.outputParent : undefined;
  const functionSourceDir =
    typeof options.functionSourceDir === 'string'
      ? resolve(options.functionSourceDir)
      : defaultFunctionSourceDir;
  const parent = resolve(
    outputParent ?? process.env.TEMP ?? process.env.TMP ?? rootDir,
  );
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, 'intermed-importer-function-'));
  try {
    const { files: functionFiles, factsList: functionFacts } =
      collectFunctionGraph(functionSourceDir);
    const { program, compileDir } = compilePackages(staging);
    const closure = analyzeRuntimeClosure({ program, functionFacts });
    const packagesInClosure = emitVendorTree(staging, compileDir, closure);

    const functionEntry = join(staging, 'src');
    mkdirSync(functionEntry, { recursive: true });
    const functionDestinations = [];
    for (const [rel, sourcePath] of functionFiles) {
      const destination = join(functionEntry, ...rel.split('/'));
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(sourcePath, destination);
      functionDestinations.push(destination);
    }
    for (const destination of functionDestinations) {
      transformJavaScript(destination, null);
      assertInside(destination, staging);
    }

    writeRootPackage(staging, closure, functionFacts, packagesInClosure);
    installRuntimeLock(staging);
    assertInside(compileDir, staging);
    rmSync(compileDir, { recursive: true, force: true });
    return staging;
  } catch (error) {
    assertInside(staging, parent);
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const artifact = buildImporterFunctionArtifact();
  console.log(`Artifact built successfully: ${artifact}`);
}
