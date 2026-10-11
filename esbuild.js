const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'better-sqlite3'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/app/index.tsx'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
};

/**
 * Copies better-sqlite3 (and its loader deps) into dist/node_modules/ so the
 * VSIX ships the native binary without needing root-level node_modules.
 * Node.js resolves require('better-sqlite3') from dist/, so dist/node_modules/
 * is found first.
 */
function copyNativeModules() {
  // better-sqlite3 runtime deps (bindings/file-uri-to-path used by older loaders,
  // harmless to include for v13)
  const modules = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
  const destDir = path.join('dist', 'node_modules');
  fs.mkdirSync(destDir, { recursive: true });

  for (const mod of modules) {
    const src = path.join('node_modules', mod);
    const dest = path.join(destDir, mod);
    if (!fs.existsSync(src)) {
      console.warn(`⚠️  Skipping ${mod} (not found in node_modules)`);
      continue;
    }
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    // -rL follows pnpm symlinks so we copy actual files, not symlinks
    execSync(`cp -rL "${src}" "${dest}"`);
    console.log(`📦 Copied ${mod} → dist/node_modules/`);
  }
}

async function main() {
  if (isWatch) {
    const [extCtx, webCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('👀 Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    copyNativeModules();
    console.log('✅ Build complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
