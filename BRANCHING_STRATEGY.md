# Branching Strategy

## Branch Roles

- `main`: production-ready code only.
- `develop`: integration branch for completed work before release.
- `feature/*`: isolated feature work, branched from `develop`.
- `bugfix/*`: non-urgent fixes, branched from `develop`.
- `hotfix/*`: urgent production fixes, branched from `main`.

## Workflow

1. Create a feature branch from `develop`.
2. Keep commits small and focused.
3. Open a pull request back into `develop`.
4. Merge `develop` into `main` only when a release is ready.
5. Use `hotfix/*` only for production issues that cannot wait.

## Naming Convention

- `feature/ai-image-generation`
- `bugfix/remote-repo-url`
- `hotfix/xai-model-fallback`

## Release Process

- Tag production merges from `main`.
- Keep `develop` ahead of `main` so ongoing work does not block releases.
- Prefer squash merges for feature branches to keep history readable.

## Notes For This Project

- Treat AI provider changes as high-risk backend changes and isolate them in dedicated feature branches.
- Keep database migrations in separate commits or branches when possible.
- Do not mix UI refactors with API or storage changes in the same branch.
