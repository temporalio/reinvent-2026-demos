# Loan browser dependencies

The assessment viewer uses pinned local browser bundles instead of a CDN. Marked parses Markdown; DOMPurify restricts the output to headings, paragraphs, emphasis, lists, code, tables, and links. Images, frames, SVG, MathML, style, and event attributes are not allowed. Links are restricted to HTTP(S), mailto, and relative URLs and open with noopener/noreferrer. If parsing or sanitization is unavailable, the viewer displays plain text.

The browser loads the same files tested here from ../static/vendor/. This directory contains the maintained renderer source and the npm manifest/lock; the generated browser assets are also committed for standalone Python runs. The Loan web Dockerfile regenerates them in a Node build stage and copies the generated assets into the Python image. Node and jsdom are not runtime dependencies.

## Update and verify

With Node 22.22.2 or newer supported by jsdom:

```sh
npm ci --ignore-scripts
npm run verify
npm test
npm audit --audit-level=high
```

Run verify **before** build in CI: it compares the committed bytes and provenance to the installed locked dependencies. A lockfile-only update must fail until its generated browser assets are committed. To accept an update:

```sh
npm ci --ignore-scripts
npm run build
npm run verify
npm test
npm audit --audit-level=high
```

Commit package.json/package-lock.json and the regenerated ../static/vendor/ files together. The generator records the lockfile SHA-256, npm tarball integrity, exact installed versions/licenses, and asset SHA-256 hashes in ../static/vendor/PROVENANCE.json. It has no timestamps, so regeneration is deterministic. It does not download files or execute package scripts.

## Provenance

Verified November 21, 2026:

- Marked 18.2.1: MIT; [upstream repository](https://github.com/markedjs/marked). Its distributed LICENSE also preserves upstream Markdown/showdown notices. The exact file is copied as marked.LICENSE.
- DOMPurify 3.4.18: MPL-2.0 OR Apache-2.0; [upstream repository](https://github.com/cure53/DOMPurify). Both distributed license files are copied as dompurify.LICENSE and dompurify.LICENSE-MPL.
- jsdom 31.0.1: MIT; [upstream repository](https://github.com/jsdom/jsdom). This is a development-only test dependency and is not copied into the web image. Its supported Node ranges are declared in package.json.

Tests execute the actual vendored browser bundles inside jsdom. Network requests are intercepted and blocked; no provider, AWS, or model access is used. Tests cover formatting/tables/links, malicious HTML and event handlers, plain-text failure behavior, and stale-bundle verification.
