#!/bin/sh
# scripts/build-docs.sh - local docs pipeline (CI's proven inline steps).
# Invoke as: sh ./scripts/build-docs.sh   (hosted builders drop the executable bit)
# Expects: ruby + bundler (Gemfile lives inside docs/) and node >= 20.
# Pagefind via npx fallback is local-dev OK only; CI uses the musl tarball
# (the npx path died in CI once - see .github/workflows/docs.yml note).
set -e
cd "$(dirname "$0")/.."
( cd docs && bundle exec jekyll build )
npx --yes freestruct@1.0.0 --strict     # discovers docs/freestruct.config.yml + docs/_site
npx --yes pagefind --site docs/_site    # local-dev only, see note
echo "docs build complete: docs/_site"
