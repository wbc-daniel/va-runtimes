# va-runtimes

A repository that holds published, versioned snapshots of built application artifacts — currently Flutter web and web app builds. Rather than publishing packages to a registry, built outputs are committed directly here so they can be referenced, deployed, or distributed as a single source of truth.

---

## How it works

`scripts/publish/` contains a Node.js publish script driven by a YAML config file. Each **step** in the config declares one or more **operations** to perform. Steps are run independently, which allows copy and release (tag + push) to be triggered separately and only when something has actually changed.

### Change detection

The copy operation computes a SHA-256 hash of the source directory (honoring both `ignore` patterns and `.gitignore`) and compares it to the hash stored in `<dest>/.publish-hash` from the previous run. If the hashes match, the copy is skipped entirely. When a copy does happen, the hash file is updated and committed alongside the artifact files — giving a traceable record of what source state each published version corresponds to.

Git operations (`commit`, `create_tag`, `push`, `push_tags`) respect the step-level `only_if_changes` flag. When set, they are all skipped if no commit was produced in the same step, so a no-op copy cleanly propagates through and prevents empty commits or duplicate tags.

### Versioning

Steps can declare `version_from` pointing to a `pubspec.yaml` (Flutter) or `package.json` (web app). The version is read automatically and made available as `{{version}}` in any operation's `message` or `tag` fields. Flutter build metadata (e.g. `1.0.0+3`) is stripped to keep tags semver-compatible.

---

## Setup

```bash
cd scripts/publish
npm install
```

---

## Running

```bash
# Run all steps in order
node scripts/publish/publish.js

# Run specific steps
node scripts/publish/publish.js copy_flutter
node scripts/publish/publish.js publish_flutter
node scripts/publish/publish.js copy_web
node scripts/publish/publish.js publish_web
```

### Typical workflow

```bash
# 1. Copy artifacts (skipped automatically if nothing changed)
node scripts/publish/publish.js copy_flutter copy_web

# 2. Commit, tag, and push (skipped if copy found no changes)
node scripts/publish/publish.js publish_flutter publish_web
```

### Dry run

Pass `--dry-run` to perform all copy operations while skipping every git operation (commit, tag, push). This lets you inspect what changed and revert if needed before committing anything.

```bash
node scripts/publish/publish.js --dry-run
node scripts/publish/publish.js --dry-run copy_flutter publish_flutter

# Revert copies if you don't want to keep them
git checkout -- .
```

---

## Config — `publish.config.yaml`

```yaml
steps:
  <step_name>:
    version_from: path/to/pubspec.yaml   # or package.json — optional
    only_if_changes: true                # optional, applies to all git operations in this step
    operations:
      - type: copy | commit | create_tag | push | push_tags
        # ... operation-specific fields
```

### Step fields

| Field | Description |
|---|---|
| `version_from` | Path to `pubspec.yaml` or `package.json` (relative to repo root or `~`). Exposes `{{version}}` to all operations in the step. |
| `only_if_changes` | When `true`, all git operations in the step are skipped if no commit was made. Individual operations can override this. |

### Operations

#### `copy`

Copies a directory into the repo root. Performs a clean sync — files deleted from the source are removed from the destination.

| Field | Description |
|---|---|
| `src` | Source path. Supports `~` and relative paths (resolved from repo root). |
| `hash_check` | Skip copy if source hash matches stored hash. |
| `use_gitignore` | Run `git ls-files` in the source and copy only tracked files, respecting all `.gitignore` rules. Falls back gracefully if the source is not a git repo. |
| `ignore` | List of file/folder names or glob patterns to exclude (applied on top of `use_gitignore`). |

#### `commit`

Stages all changes and creates a git commit.

| Field | Description |
|---|---|
| `message` | Commit message. Supports `{{version}}` and any `vars` keys. |
| `vars` | Key-value pairs substituted into `message`. Merged with step-level vars; operation wins on conflict. |

#### `create_tag`

Creates a git tag at the current HEAD.

| Field | Description |
|---|---|
| `tag` | Tag name. Supports `{{version}}` and any `vars` keys. |
| `message` | If provided, creates an annotated tag. |
| `vars` | Key-value pairs substituted into `tag` and `message`. |

#### `push`

Pushes a branch to a remote.

| Field | Description |
|---|---|
| `remote` | Remote name (default: `origin`). |
| `branch` | Branch ref (default: `HEAD`). |

#### `push_tags`

Pushes all tags to a remote.

| Field | Description |
|---|---|
| `remote` | Remote name (default: `origin`). |

---

## Published artifacts

| Directory | Source |
|---|---|
| `vector_animate_flutter/` | Flutter package |
| `dist/` | Web app build output |

Each artifact directory contains a `.publish-hash` file recording the SHA-256 hash of the source at the time it was last published.
