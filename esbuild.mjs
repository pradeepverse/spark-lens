import * as esbuild from 'esbuild';
import { rmSync } from 'fs';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: { extension: 'src/extension.ts', pdfWorker: 'src/sources/pdfWorker.ts' },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outdir: 'dist',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  // unpdf ships ESM that reads import.meta.url; give it a CommonJS-safe value.
  define: { 'import.meta.url': 'importMetaUrl' },
  banner: { js: "const importMetaUrl = require('url').pathToFileURL(__filename).href;" },
});

if (production) for (const f of ['extension', 'pdfWorker']) rmSync(`dist/${f}.js.map`, { force: true });

if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
