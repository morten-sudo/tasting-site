import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://winetastr.krusesoendergaard.dk',
  output: 'static',
  // Page scripts use top-level await (resolving the guest's code before rendering)
  vite: { build: { target: 'es2022' } },
});
