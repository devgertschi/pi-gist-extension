# pi-gist-extension

A user-scope pi extension that adds `/gist`.

It creates a secret GitHub Gist from the last assistant message and copies the Gist URL to your clipboard.

## Requirements

- `gh` (GitHub CLI)
- `gh auth login`

## Install

Copy `gist.ts` to your pi user extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
cp gist.ts ~/.pi/agent/extensions/
```

Then reload pi:

```text
/reload
```

## Usage

```text
/gist
```

The temporary filename format used for the gist upload is:

```text
pi-gist-YYYYMMDD-HHMM.md
```
