# crypto-dashboard

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel
- Production URL: (not set — fill in after first Vercel deploy, e.g. `https://crypto-dashboard.vercel.app`)
- Deploy workflow: Vercel auto-deploy on push to `main` (once project is linked)
- Deploy status command: `vercel ls --prod` (requires `vercel` CLI logged in)
- Merge method: squash
- Project type: Next.js 16 web app
- Post-deploy health check: none (manual verification)

### Custom deploy hooks
- Pre-merge: `npm run typecheck && npm run lint && npm test && npm run build` (already enforced by `.github/workflows/ci.yml`)
- Deploy trigger: automatic on push to `main` once Vercel project is linked
- Deploy status: `vercel ls --prod` (or check the Vercel dashboard)
- Health check: none — verify manually after deploy

## Design System
Always read DESIGN.md before making any visual or UI decisions. All font
choices, colors, spacing, motion tokens, and aesthetic direction are defined
there. The system is also implemented in `src/app/globals.css` and
`src/app/layout.tsx` — those files are the runtime source of truth; DESIGN.md
explains the why and vocabulary. If the two disagree, the CSS wins and
DESIGN.md is updated to match. Do not add arbitrary `bg-[#xxx]`, `text-[xxx]`,
or `font-[xxx]` utilities — fit the change into an existing token or propose
a new one with a rationale.

### Vercel setup notes
- This project has `output: 'standalone'` in `next.config.ts` for cPanel hosting. Vercel handles Next.js natively and doesn't need it; consider gating `output: 'standalone'` behind `process.env.DEPLOY_TARGET === 'cpanel'` once Vercel is the primary target.
- Before the first Vercel deploy: run `vercel link` in the project root (or import the repo from the Vercel dashboard).
- Worker scripts (`scripts/worker/start.ts`, `scripts/screener/start.ts`) are long-running processes and won't run on Vercel's serverless runtime — they need a separate host (VPS, Fly Machines, Railway, etc.).
- The existing `deploy-cpanel.bat` flow is preserved as a fallback if cPanel hosting is ever revived.
