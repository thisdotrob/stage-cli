#!/usr/bin/env bash
set -euo pipefail

# Non-interactive bash doesn't source shell profiles, so tool managers (mise, asdf, volta)
# won't have added their shim dirs to PATH. Prepend the common ones so we find pnpm etc.
export PATH="$HOME/.local/share/mise/shims:$HOME/.asdf/shims:$HOME/.volta/bin:$PATH"
export MISE_YES=1  # suppress mise trust/install prompts in non-interactive context

readonly SOURCE_REPO="thisdotrob/stage-cli"
readonly SOURCE_REF="main"
readonly TARBALL_URL="https://codeload.github.com/thisdotrob/stage-cli/tar.gz/main"
readonly SKILL_NAME="stage-chapters"
readonly SKILL_AGENT="cline"

log() {
	printf '==> %s\n' "$*"
}

die() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

need_command() {
	command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

download() {
	local url="$1"
	local destination="$2"

	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url" -o "$destination"
		return
	fi

	if command -v wget >/dev/null 2>&1; then
		wget -qO "$destination" "$url"
		return
	fi

	die "Missing required command: curl or wget"
}

need_command node
need_command npm
need_command tar
need_command find
need_command mktemp

node -e 'const major = Number(process.versions.node.split(".")[0]); process.exit(major >= 20 ? 0 : 1)' \
	|| die "Node.js 20 or newer is required"

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/stagereview-install.XXXXXXXXXX")"

cleanup() {
	rm -rf "$tmp_dir"
}
trap cleanup EXIT

archive="$tmp_dir/source.tar.gz"
source_parent="$tmp_dir/source"
pack_dir="$tmp_dir/pack"

log "Downloading stagereview source from $SOURCE_REPO@$SOURCE_REF"
download "$TARBALL_URL" "$archive"

mkdir -p "$source_parent" "$pack_dir"
tar -xzf "$archive" -C "$source_parent"
source_dir="$(find "$source_parent" -mindepth 1 -maxdepth 1 -type d -print -quit)"

[[ -n "$source_dir" ]] || die "Downloaded archive did not contain a source directory"
[[ -f "$source_dir/package.json" ]] || die "Downloaded source is missing package.json"

if command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then
	pnpm_command=(corepack pnpm)
elif command -v pnpm >/dev/null 2>&1; then
	pnpm_command=(pnpm)
else
	die "Missing pnpm. Install pnpm or enable Corepack, then rerun this installer."
fi

log "Installing dependencies"
(
	cd "$source_dir"
	"${pnpm_command[@]}" install --frozen-lockfile
)

log "Building CLI and web app"
(
	cd "$source_dir"
	"${pnpm_command[@]}" build
)

log "Packing CLI"
(
	cd "$source_dir/packages/cli"
	npm pack --pack-destination "$pack_dir" >/dev/null
)

cli_tarball="$(find "$pack_dir" -maxdepth 1 -name 'stagereview-*.tgz' -print -quit)"
[[ -n "$cli_tarball" ]] || die "CLI package tarball was not created"

log "Installing stagereview CLI globally"
npm install -g "$cli_tarball"

log "Installing $SKILL_NAME skill to ~/.agents/skills"
(
	cd "$source_dir"
	if command -v npx >/dev/null 2>&1; then
		npx -y skills add . --skill "$SKILL_NAME" --copy --global --agent "$SKILL_AGENT" -y
	else
		npm exec --yes --package skills -- skills add . --skill "$SKILL_NAME" --copy --global --agent "$SKILL_AGENT" -y
	fi
)

skill_file="${HOME}/.agents/skills/${SKILL_NAME}/SKILL.md"
[[ -f "$skill_file" ]] || die "Skill install completed, but $skill_file was not found"

log "Installed stagereview"
if command -v stagereview >/dev/null 2>&1; then
	stagereview --version
fi

log "Installed $SKILL_NAME skill at $skill_file"
printf 'Restart your agent to pick up the installed skill.\n'
