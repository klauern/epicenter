# Bun to PNPM Migration Plan

## Overview
This document outlines the plan to migrate the Whispering project from Bun workspaces back to PNPM workspaces while maintaining the existing folder structure (`apps/*` and `packages/*`).

## Current State Analysis

### Workspace Structure
- **Apps**: app, auth, cli, sh, sh-proxy
- **Packages**: config, constants, shared, svelte-utils, ui
- **Build Tool**: Turborepo
- **Package Manager**: Bun with workspaces and catalogs
- **Node.js**: LTS version

### Bun-Specific Features in Use
1. **Workspaces with Catalogs**: Centralized dependency management in root package.json
2. **Direct TypeScript Execution**: Scripts like `bump-version.ts` run directly
3. **Binary Lockfile**: `bun.lockb` (if present)
4. **Workspace Filtering**: `bun --filter` commands in CI/CD

## Reasons for Migration
- Team preference or organizational standards
- Better compatibility with certain tools or workflows
- More mature workspace features in PNPM
- Preference for text-based lockfiles over binary

## Migration Steps

### 1. Create Migration Branch
```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create a new feature branch for the migration
git checkout -b feat/migrate-to-pnpm-workspaces
```

### 2. Install PNPM
```bash
# Install PNPM globally via npm
npm install -g pnpm@latest

# Or using corepack (recommended)
corepack enable
corepack prepare pnpm@latest --activate
```

### 3. Create PNPM Workspace Configuration
Create `pnpm-workspace.yaml` in the root:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 4. Convert Catalogs to PNPM Format
PNPM uses a different approach for shared dependencies. Update the root `package.json`:

```json
{
  "name": "whispering",
  "private": true,
  "version": "7.1.1",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "format": "concurrently \"biome format --write .\" \"turbo run format\"",
    "lint": "concurrently \"biome lint --write --unsafe .\" \"turbo run lint\"",
    "format-and-lint": "concurrently \"pnpm run format\" \"pnpm run lint\"",
    "bump-version": "pnpm exec tsx scripts/bump-version.ts"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^22.15.32",
    "concurrently": "^9.1.2",
    "turbo": "^2.3.3",
    "tsx": "^4.7.0"
  }
}
```

Note: PNPM doesn't have a direct equivalent to Bun's catalogs. Instead, we'll use:
- Workspace protocol (`workspace:*`) for internal packages
- `.npmrc` with `shared-workspace-lockfile=true` for consistent versions
- Consider using `@pnpm/meta-updater` for centralized version management

### 5. Update Workspace Package Dependencies
For each workspace package, update `catalog:` references to explicit versions. 

Example for `packages/ui/package.json`:
```json
{
  "devDependencies": {
    "@types/node": "^22.15.32",
    "eslint": "^9.30.1",
    "prettier": "^3.6.2",
    "svelte": "^5.35.5",
    "tailwindcss": "^4.1.11",
    "typescript": "^5.8.3"
  },
  "dependencies": {
    "bits-ui": "2.8.10",
    "clsx": "^2.1.1",
    "lucide-svelte": "^0.525.0",
    "mode-watcher": "^1.0.8",
    "svelte-sonner": "^1.0.5",
    "@tanstack/svelte-table": "9.0.0-alpha.10",
    "tailwind-merge": "^3.3.1",
    "tailwind-variants": "^1.0.0"
  }
}
```

### 6. Create .npmrc Configuration
Create or update `.npmrc` in the root:

```
# Enable automatic peer dependency installation
auto-install-peers=true

# Use a shared lockfile for all workspaces
shared-workspace-lockfile=true

# Optional: Set registry if using private registry
# registry=https://registry.npmjs.org/

# Optional: Hoist patterns
# public-hoist-pattern[]=*eslint*
# public-hoist-pattern[]=*prettier*
```

### 7. Update Package Scripts
Replace all `bun` references with `pnpm` equivalents:

```bash
# Find all bun references in package.json files
grep -r "bun" --include="package.json" .

# Update commands:
# "bun install" → "pnpm install"
# "bun run" → "pnpm run"
# "bun --filter" → "pnpm --filter"
# "bun tauri dev" → "pnpm tauri dev"
# "bun exec" → "pnpm exec"
```

### 8. Handle TypeScript Execution
Since PNPM doesn't execute TypeScript directly, install `tsx`:

```bash
# Already added to root devDependencies
# Update scripts that run .ts files directly
# "bun run scripts/bump-version.ts" → "pnpm exec tsx scripts/bump-version.ts"
```

### 9. Remove Bun-Specific Files
```bash
# Remove Bun lockfile
rm bun.lockb

# Remove Bun configuration if present
rm bunfig.toml
```

### 10. Generate PNPM Lockfile
```bash
# Clean install with PNPM
pnpm install

# This will:
# - Read workspace configuration from pnpm-workspace.yaml
# - Install all dependencies for all workspaces
# - Generate pnpm-lock.yaml
```

### 11. Update GitHub Actions

#### Update publish-tauri-releases.yml
```yaml
name: publish tauri releases

on:
  push:
    branches:
      - release

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target x86_64-apple-darwin'
          - platform: 'macos-latest'
            args: '--target aarch64-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'windows-latest'
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      # Install PNPM
      - name: setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      # Setup Node with PNPM caching
      - name: setup node
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: 'pnpm'

      # Rust setup remains the same
      - name: install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      # Linux dependencies remain the same
      - name: install dependencies (ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      # Install frontend dependencies with PNPM
      - name: install frontend dependencies
        run: pnpm install

      # Update the build command to use PNPM
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'Whispering v__VERSION__'
          releaseBody: 'See the assets to download and install this version.'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
          beforeBuildCommand: |
            pnpm --filter @repo/app build
```

### 12. Update Local Development Documentation
Update any documentation that references Bun commands:

```bash
# Find all markdown files with bun references
grep -r "bun" --include="*.md" docs/

# Update installation instructions
# Update development setup guides
# Update contribution guidelines
```

### 13. Testing & Verification

```bash
# Test clean installation
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
pnpm install

# Test development servers
pnpm run dev

# Test builds
pnpm run build

# Test workspace filtering
pnpm --filter @repo/app dev

# Test Tauri development
cd apps/app
pnpm tauri dev

# Test TypeScript script execution
pnpm run bump-version
```

### 14. Migration Checklist

- [ ] PNPM installed and available
- [ ] `pnpm-workspace.yaml` created
- [ ] Root package.json updated (removed catalogs, updated scripts)
- [ ] All workspace package.json files updated (catalog: → explicit versions)
- [ ] `.npmrc` configured with auto-install-peers
- [ ] All scripts updated from `bun` to `pnpm` commands
- [ ] TypeScript execution handled with `tsx`
- [ ] Bun-specific files removed (bun.lockb, bunfig.toml)
- [ ] `pnpm-lock.yaml` generated successfully
- [ ] GitHub Actions updated to use PNPM
- [ ] All tests passing
- [ ] Documentation updated

## Potential Issues & Solutions

### Issue 1: Dependency Resolution Differences
PNPM's stricter dependency resolution might reveal missing dependencies.
**Solution**: Add any missing dependencies explicitly to package.json files.

### Issue 2: Hoisting Differences
Some packages might expect dependencies to be hoisted to root node_modules.
**Solution**: Configure hoisting patterns in `.npmrc`:
```
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=@types/*
```

### Issue 3: Performance Differences
PNPM might be slower than Bun for installs.
**Solution**: 
- Use `pnpm install --frozen-lockfile` in CI for faster installs
- Enable parallel installs with `pnpm config set recursive-install true`

### Issue 4: TypeScript Execution
Direct .ts file execution not supported.
**Solution**: Use `tsx` or `ts-node` for TypeScript files.

## Version Management Without Catalogs

Since PNPM doesn't have built-in catalogs, consider these alternatives:

### Option 1: Syncpack
```bash
# Install syncpack
pnpm add -D syncpack

# Add to package.json scripts
"sync-versions": "syncpack fix-mismatches"

# Create .syncpackrc.json for version rules
```

### Option 2: PNPM Overrides
Add to root package.json:
```json
{
  "pnpm": {
    "overrides": {
      "svelte": "^5.35.5",
      "typescript": "^5.8.3"
    }
  }
}
```

### Option 3: Workspace Protocol
Use `workspace:*` for internal packages to ensure version consistency.

## Rollback Plan

If issues arise:
```bash
# Restore Bun configuration
git checkout main -- package.json bun.lock
git checkout main -- "**/package.json"
rm pnpm-workspace.yaml
rm pnpm-lock.yaml

# Reinstall with Bun
bun install
```

## Timeline

1. **Preparation** (30 min): Install PNPM, create branch
2. **Configuration** (2 hours): Update all package.json files
3. **Migration** (1 hour): Remove Bun files, run PNPM install
4. **CI/CD Updates** (1 hour): Update GitHub Actions
5. **Testing** (2 hours): Verify all functionality
6. **Documentation** (30 min): Update docs

Total estimated time: 7 hours

## Success Criteria

- [ ] All dependencies install correctly
- [ ] No version mismatches between workspaces
- [ ] Development servers start without errors
- [ ] Production builds complete successfully
- [ ] All tests pass
- [ ] Turborepo commands work correctly
- [ ] CI/CD pipelines pass with PNPM
- [ ] TypeScript scripts execute properly
- [ ] No regression in development experience

## Review

### Migration Summary
The migration from Bun to pnpm has been completed successfully. Here's what was accomplished:

1. **Branch Creation**: Created `feat/migrate-to-pnpm-workspaces` branch
2. **Workspace Configuration**: Created `pnpm-workspace.yaml` with apps/* and packages/* structure
3. **Package.json Updates**: 
   - Removed Bun's catalog configuration from root package.json
   - Updated all scripts from `bun` to `pnpm` commands
   - Added `tsx` for TypeScript execution
   - Added `packageManager` field specifying pnpm@10.12.3
   - Replaced all `catalog:` references with explicit versions in all workspace packages
4. **Configuration Files**: Created `.npmrc` with auto-install-peers and hoisting patterns
5. **GitHub Actions**: Updated publish-tauri-releases.yml to use pnpm instead of Bun
6. **Cleanup**: Removed Bun-specific files (bun.lock)
7. **Testing**: Successfully ran `pnpm install` and `pnpm run build`

### Changes Made
- **Files Added**:
  - `pnpm-workspace.yaml`
  - `.npmrc`
  - `pnpm-lock.yaml` (generated)
  - `docs/specs/20250127T195500-bun-to-pnpm-migration.md`

- **Files Modified**:
  - `package.json` (root)
  - `apps/app/package.json`
  - `packages/config/package.json`
  - `packages/shared/package.json`
  - `packages/ui/package.json`
  - `.github/workflows/publish-tauri-releases.yml`

- **Files Removed**:
  - `bun.lock`

### Notes
- Installation completed with warnings about deprecated packages and peer dependencies
- Build process completed successfully with no errors
- All workspaces are properly recognized by pnpm
- Turbo integration works correctly with pnpm

### Next Steps
1. Commit these changes
2. Create pull request for review
3. Update development documentation
4. Notify team members to install pnpm