#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');
const { minimatch } = require('minimatch');

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'publish.config.yaml');
const HASH_FILE = '.publish-hash';

// --- Config ---

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return yaml.load(raw);
}

// --- Version ---

function loadVersionFrom(filePath) {
  const resolved = path.resolve(REPO_ROOT, filePath.replace(/^~/, process.env.HOME));
  const ext = path.extname(resolved);

  if (ext === '.yaml' || ext === '.yml') {
    const content = yaml.load(fs.readFileSync(resolved, 'utf8'));
    if (!content.version) throw new Error(`No 'version' field in ${resolved}`);
    // Strip Flutter build metadata (e.g. 1.0.0+1 -> 1.0.0)
    return String(content.version).replace(/\+.*$/, '');
  }

  if (ext === '.json') {
    const content = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (!content.version) throw new Error(`No 'version' field in ${resolved}`);
    return content.version;
  }

  throw new Error(`Unsupported version_from file type: ${ext} (expected .yaml, .yml, or .json)`);
}

// --- Helpers ---

function shouldIgnore(name, ignorePatterns) {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;
  return ignorePatterns.some(
    (pattern) =>
      minimatch(name, pattern, { dot: true }) ||
      minimatch(name, pattern, { dot: true, matchBase: true })
  );
}

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`Unknown variable: {{${key}}}`);
    return vars[key];
  });
}

// --- Hash ---

function computeDirHash(dirPath, ignorePatterns) {
  const hash = crypto.createHash('sha256');

  function walk(dir, relBase) {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (shouldIgnore(entry.name, ignorePatterns)) continue;
      const rel = relBase ? relBase + '/' + entry.name : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        hash.update(rel); // include relative path so renames are detected
        hash.update(fs.readFileSync(full));
      }
    }
  }

  walk(dirPath, '');
  return hash.digest('hex');
}

// --- Copy ---

function clearDir(dir, preserve = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (preserve.includes(entry.name)) continue;
    fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
  }
}

function copyDir(src, dest, ignorePatterns) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldIgnore(entry.name, ignorePatterns)) {
      console.log(`  skip  ${path.join(src, entry.name)}`);
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, ignorePatterns);
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      console.log(`  copy  ${srcPath} -> ${destPath}`);
    }
  }
}

function runCopy(operation, stepName) {
  const src = operation.src.replace(/^~/, process.env.HOME);
  const resolvedSrc = path.resolve(REPO_ROOT, src);
  const dest = path.join(REPO_ROOT, operation.dest || path.basename(resolvedSrc));
  const ignorePatterns = operation.ignore || [];

  if (!fs.existsSync(resolvedSrc)) {
    throw new Error(`[${stepName}] Source not found: ${resolvedSrc}`);
  }

  if (operation.hash_check) {
    const sourceHash = computeDirHash(resolvedSrc, ignorePatterns);
    const hashFilePath = path.join(dest, HASH_FILE);
    const storedHash = fs.existsSync(hashFilePath)
      ? fs.readFileSync(hashFilePath, 'utf8').trim()
      : null;

    if (sourceHash === storedHash) {
      console.log(`[${stepName}] No changes detected (${sourceHash.slice(0, 8)}), skipping copy.`);
      return;
    }

    const prev = storedHash ? storedHash.slice(0, 8) : 'none';
    console.log(`[${stepName}] Changes detected (${prev} -> ${sourceHash.slice(0, 8)})`);
    fs.mkdirSync(dest, { recursive: true });
    clearDir(dest, [HASH_FILE]);
    copyDir(resolvedSrc, dest, ignorePatterns);
    fs.writeFileSync(hashFilePath, sourceHash + '\n');
  } else {
    console.log(`[${stepName}] copy ${resolvedSrc} -> ${dest}`);
    fs.mkdirSync(dest, { recursive: true });
    copyDir(resolvedSrc, dest, ignorePatterns);
  }
}

// --- Git ---

function git(args, stepName) {
  console.log(`  git ${args.join(' ')}`);
  try {
    const out = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (out.trim()) process.stdout.write(out);
  } catch (err) {
    throw new Error(`[${stepName}] git ${args[0]} failed: ${err.stderr || err.message}`);
  }
}

function hasGitChanges() {
  const out = execFileSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out.trim().length > 0;
}

function runCommit(operation, stepName, ctx) {
  if (ctx.dryRun) {
    console.log(`[${stepName}] [dry-run] skipping commit`);
    return;
  }
  if (operation.only_if_changes && !hasGitChanges()) {
    console.log(`[${stepName}] No git changes, skipping commit.`);
    return;
  }
  const vars = operation.vars || {};
  const message = interpolate(operation.message, vars);
  git(['add', '-A'], stepName);
  git(['commit', '-m', message], stepName);
  ctx.committed = true;
}

function runCreateTag(operation, stepName, ctx) {
  if (ctx.dryRun) {
    console.log(`[${stepName}] [dry-run] skipping create_tag`);
    return;
  }
  // only_if_changes: only tag when a commit was made in this same step
  if (operation.only_if_changes && !ctx.committed) {
    console.log(`[${stepName}] No new commit in this step, skipping tag.`);
    return;
  }
  const vars = operation.vars || {};
  const tag = interpolate(operation.tag, vars);
  const args = ['tag', tag];
  if (operation.message) args.push('-m', interpolate(operation.message, vars));
  git(args, stepName);
}

function runPush(operation, stepName, ctx) {
  if (ctx.dryRun) {
    console.log(`[${stepName}] [dry-run] skipping push`);
    return;
  }
  if (operation.only_if_changes && !ctx.committed) {
    console.log(`[${stepName}] No new commit in this step, skipping push.`);
    return;
  }
  const remote = operation.remote || 'origin';
  const branch = operation.branch || 'HEAD';
  git(['push', remote, branch], stepName);
}

function runPushTags(operation, stepName, ctx) {
  if (ctx.dryRun) {
    console.log(`[${stepName}] [dry-run] skipping push_tags`);
    return;
  }
  if (operation.only_if_changes && !ctx.committed) {
    console.log(`[${stepName}] No new commit in this step, skipping push tags.`);
    return;
  }
  const remote = operation.remote || 'origin';
  git(['push', remote, '--tags'], stepName);
}

// --- Runner ---

function runStep(stepName, step, dryRun) {
  console.log(`\n=== Step: ${stepName} ===`);
  const ctx = { committed: false, dryRun, vars: {} };

  if (step.version_from) {
    ctx.vars.version = loadVersionFrom(step.version_from);
    console.log(`[${stepName}] version: ${ctx.vars.version} (from ${step.version_from})`);
  }

  for (const operation of step.operations) {
    // step-level defaults merged with operation; operation wins on conflict
    const op = {
      only_if_changes: step.only_if_changes,
      ...operation,
      vars: { ...ctx.vars, ...(operation.vars || {}) },
    };

    switch (op.type) {
      case 'copy':       runCopy(op, stepName); break;
      case 'commit':     runCommit(op, stepName, ctx); break;
      case 'create_tag': runCreateTag(op, stepName, ctx); break;
      case 'push':       runPush(op, stepName, ctx); break;
      case 'push_tags':  runPushTags(op, stepName, ctx); break;
      default: throw new Error(`[${stepName}] Unknown operation type: ${op.type}`);
    }
  }
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  let configPath = CONFIG_PATH;
  const steps = [];

  const rest = argv.filter((a) => a !== '--dry-run');
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--config' || rest[i] === '-c') {
      if (!rest[i + 1]) { console.error('--config requires a path'); process.exit(1); }
      configPath = path.resolve(rest[++i]);
    } else {
      steps.push(rest[i]);
    }
  }

  return { dryRun, configPath, steps };
}

function main() {
  const { dryRun, configPath, steps: stepArgs } = parseArgs(process.argv.slice(2));

  if (dryRun) console.log('[dry-run] Git operations will be skipped. Changes can be reverted with: git checkout -- .\n');

  const config = loadConfig(configPath);
  const { steps } = config;

  const targetSteps = stepArgs.length > 0 ? stepArgs : Object.keys(steps);

  for (const stepName of targetSteps) {
    if (!steps[stepName]) {
      console.error(`Step not found: ${stepName}`);
      process.exit(1);
    }
    runStep(stepName, steps[stepName], dryRun);
  }

  console.log('\nDone.');
}

main();
