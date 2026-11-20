import { build as viteBuild } from 'vite';
import { build as esbuildBuild } from 'esbuild';

async function runBuild() {
  console.log('Building Vite frontend bundle...');
  await viteBuild();

  console.log('Building Esbuild server bundle...');
  await esbuildBuild({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: 'server.js',
    packages: 'external',
  });

  console.log('Build completed successfully!');
}

runBuild().catch((err) => {
  console.error('Build error:', err);
  process.exit(1);
});
