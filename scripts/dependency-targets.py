#!/usr/bin/env python3
"""Select compatibility checks from changed files (Python 3.11+ and PyYAML).

Discover package roots under apps rather than maintaining another app inventory.
The sandbox-samples and sandbox-template directories are test fixtures used by
SDLC scenarios, not independently deployed applications. Their npm manifests are
excluded from package matrices; their parent Docker build can still be affected.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import tomllib

import yaml

SKIP_PARTS = {'.git', 'node_modules', '.venv', '__pycache__', 'dist', 'target', '.next', 'tmp', '.workdirs'}
NPM_FIXTURES = {'sandbox-samples', 'sandbox-template'}
NPM_SUFFIXES = {'.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.svelte', '.vue', '.json', '.css', '.html'}
PYTHON_SUFFIXES = {'.py', '.toml', '.lock', '.txt'}


def _inside(path: Path, directory: Path) -> bool:
    return path == directory or directory in path.parents


def _discover(root: Path, filename: str, *, npm: bool = False) -> set[Path]:
    apps = root / 'apps'
    if not apps.is_dir():
        return set()
    found = set()
    for file in apps.rglob(filename):
        relative = file.relative_to(root)
        if SKIP_PARTS.intersection(relative.parts) or (npm and NPM_FIXTURES.intersection(relative.parts)):
            continue
        resolved = file.resolve()
        if _inside(resolved, root):
            found.add(resolved.parent)
    return found


def _nearest(path: Path, projects: set[Path]) -> Path | None:
    candidates = [project for project in projects if _inside(path, project)]
    return max(candidates, key=lambda value: len(value.parts)) if candidates else None


def _normalize(root: Path, files: list[str]) -> set[Path]:
    result = set()
    for value in files:
        if not value or '\x00' in value:
            continue
        path = Path(value)
        path = (path if path.is_absolute() else root / path).resolve()
        if _inside(path, root) and not SKIP_PARTS.intersection(path.relative_to(root).parts):
            result.add(path)
    return result


def _workspace_members(project: Path) -> set[Path]:
    manifest = project / 'pyproject.toml'
    if not manifest.is_file():
        return set()
    data = tomllib.loads(manifest.read_text())
    workspace = data.get('tool', {}).get('uv', {}).get('workspace', {})
    excluded = {p.resolve() for pattern in workspace.get('exclude', []) for p in project.glob(pattern)}
    return {p.resolve() for pattern in workspace.get('members', []) for p in project.glob(pattern)
            if p.is_dir() and not any(_inside(p.resolve(), exclusion) for exclusion in excluded)}


def _python_owners(projects: set[Path]) -> dict[Path, Path]:
    members = {project: _workspace_members(project) for project in projects}
    owners = {}
    for project in projects:
        candidates = [parent for parent in projects if parent != project and _inside(project, parent)
                      and any(_inside(project, member) for member in members[parent])]
        owners[project] = min(candidates, key=lambda value: len(value.parts)) if candidates else project
    return owners


def _go_dependents(projects: set[Path]) -> dict[Path, set[Path]]:
    """Include consumers of a changed local replacement module, transitively."""
    consumers = {project: set() for project in projects}
    for consumer in projects:
        text = (consumer / 'go.mod').read_text()
        for target in re.findall(r'=>\s+(\.{1,2}/[^\s)]+)', text):
            module = (consumer / target).resolve()
            if module in consumers:
                consumers[module].add(consumer)
    return consumers


def select_targets(root: Path, changed_paths: list[str]) -> dict:
    root = root.resolve()
    changed = _normalize(root, changed_paths)
    npm_projects = _discover(root, 'package.json', npm=True)
    go_projects = _discover(root, 'go.mod')
    python_projects = _discover(root, 'uv.lock')
    python_owners = _python_owners(python_projects)
    selected_npm, selected_go, selected_python = set(), set(), set()
    for file in changed:
        if file.suffix in NPM_SUFFIXES and not NPM_FIXTURES.intersection(file.relative_to(root).parts):
            if project := _nearest(file, npm_projects):
                selected_npm.add(project)
        if file.suffix in {'.go', '.mod', '.sum', '.work'}:
            if file.name in {'go.work', 'go.work.sum'}:
                selected_go.update(project for project in go_projects if _inside(project, file.parent))
            elif project := _nearest(file, go_projects):
                selected_go.add(project)
        if file.suffix in PYTHON_SUFFIXES:
            if project := _nearest(file, python_projects):
                selected_python.add(python_owners[project])
    dependents = _go_dependents(go_projects)
    pending = list(selected_go)
    while pending:
        for dependent in dependents[pending.pop()]:
            if dependent not in selected_go:
                selected_go.add(dependent)
                pending.append(dependent)
    manifest = root / 'deploy/reinvent-2026.yaml'
    spec = yaml.safe_load(manifest.read_text())['spec']
    builds = []
    for name, recipe in sorted(spec.get('builds', {}).items()):
        context = (root / recipe['context']).resolve()
        dockerfile = (root / recipe['dockerfile']).resolve()
        if not _inside(context, root) or not _inside(dockerfile, root):
            raise ValueError(f'Build {name} escapes the repository')
        if manifest in changed or any(_inside(file, context) or file == dockerfile for file in changed):
            builds.append({'name': name, 'context': recipe['context'], 'dockerfile': recipe['dockerfile']})
    relative = lambda projects: sorted(str(project.relative_to(root)) for project in projects)
    return {'npm': relative(selected_npm), 'go': relative(selected_go), 'python': relative(selected_python), 'builds': builds}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paths', nargs='*', help='Changed paths relative to the repository')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--base', help='Base Git revision for git diff --name-only')
    parser.add_argument('--head', default='HEAD', help='Head revision; defaults to HEAD')
    args = parser.parse_args()
    if (args.base and args.base.startswith('-')) or args.head.startswith('-'):
        parser.error('Git revisions must not start with an option prefix')
    if args.base and args.paths:
        parser.error('Use positional paths or --base/--head, not both')
    paths = args.paths
    if args.base:
        diff = subprocess.run(['git', '-C', str(args.root), 'diff', '--name-only', '--no-renames', '-z', args.base, args.head, '--'],
                              check=True, capture_output=True)
        paths = [path.decode('utf-8') for path in diff.stdout.split(b'\x00') if path]
    print(json.dumps(select_targets(args.root, paths), sort_keys=True))


if __name__ == '__main__':
    main()
