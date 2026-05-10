#!/usr/bin/env bash
# install.sh — Standalone bootstrapper for the Banking demo.
#
# Designed to be curl-piped:
#   curl -fsSL https://raw.githubusercontent.com/curtismu7/banking-demo/main/install.sh | bash
#
# What it does:
#   1. Confirms the install directory (default: $PWD/banking-demo).
#   2. Verifies prerequisites (git, Node 20).
#   3. Clones the repo if the target dir doesn't already contain it.
#   4. Hands off to `npm run setup:fresh -- --from-installer`, which runs
#      the same flow as if the user had cloned manually and invoked it.
#
# Designed to be safe to re-run: re-running on an existing checkout pulls
# the latest main and re-runs setup:fresh (idempotent).
#
# Env-var overrides (mostly for testing / CI):
#   INSTALL_DIR       Override the install path (default: ./banking-demo)
#   REPO_URL          Override the git repo URL
#   BANKING_BRANCH    Branch to check out (default: main)
#   DRY_RUN           Set to 1 to print commands without executing
#   ASSUME_YES        Set to 1 to skip the confirmation prompt

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────

REPO_URL="${REPO_URL:-https://github.com/curtismu7/banking-demo.git}"
BRANCH="${BANKING_BRANCH:-main}"
DEFAULT_DIR_NAME="banking-demo"
NODE_REQUIRED_MAJOR="20"

# ── Style ─────────────────────────────────────────────────────────────────────

# Detect TTY for color
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi

info()   { echo "${BLUE}${BOLD}==>${RESET} $*"; }
ok()     { echo "${GREEN}✓${RESET}  $*"; }
warn()   { echo "${YELLOW}!${RESET}  $*"; }
err()    { echo "${RED}✗${RESET}  $*" >&2; }
fatal()  { err "$*"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────────

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fatal "Required command not found: $1
  Install it and re-run install.sh.
  $2"
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js is not installed."
    cat <<EOF

  Install Node ${NODE_REQUIRED_MAJOR}.x via nvm (recommended):

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="\$HOME/.nvm"
    [ -s "\$NVM_DIR/nvm.sh" ] && \\. "\$NVM_DIR/nvm.sh"
    nvm install ${NODE_REQUIRED_MAJOR} && nvm use ${NODE_REQUIRED_MAJOR}

  Persist for new shells: append the export/source lines to ~/.zshrc (zsh) or ~/.bashrc (bash).

EOF
    exit 1
  fi
  local v major
  v="$(node --version 2>/dev/null)" || fatal "Could not run 'node --version'."
  major="${v#v}"; major="${major%%.*}"
  if [[ "$major" != "${NODE_REQUIRED_MAJOR}" ]]; then
    err "Node major ${NODE_REQUIRED_MAJOR} required, but this shell is using Node ${v}."
    cat <<EOF

  Fix (zsh/bash) — load nvm into THIS shell, then switch:
    export NVM_DIR="\$HOME/.nvm"
    [ -s "\$NVM_DIR/nvm.sh" ] && \\. "\$NVM_DIR/nvm.sh"
    nvm install ${NODE_REQUIRED_MAJOR} && nvm use ${NODE_REQUIRED_MAJOR}

EOF
    exit 1
  fi
  ok "Node ${v} (matches required ${NODE_REQUIRED_MAJOR}.x)"
}

# ── Confirm install directory ─────────────────────────────────────────────────

confirm_dir() {
  local target="$1"
  local exists="$2"

  echo ""
  echo "${BOLD}Banking demo install${RESET}"
  echo "────────────────────"
  echo "  Repo:        ${REPO_URL}"
  echo "  Branch:      ${BRANCH}"
  echo "  Install to:  ${BOLD}${target}${RESET}"
  if [[ "$exists" == "yes" ]]; then
    echo "               (directory exists — will git pull instead of clone)"
  else
    echo "               (directory will be created)"
  fi
  echo ""

  if [[ "${ASSUME_YES:-0}" == "1" ]]; then
    return 0
  fi

  # When we're in a curl-piped pipeline, stdin is the curl HTTP body —
  # not the user's keyboard. Read prompt from /dev/tty so the question
  # actually reaches the user.
  local prompt="Proceed? [Y/n] "
  local answer=""
  if [[ -t 0 ]]; then
    read -r -p "$prompt" answer
  elif [[ -e /dev/tty ]]; then
    # shellcheck disable=SC2162
    read -p "$prompt" answer </dev/tty
  else
    warn "No TTY available — skipping prompt. Set ASSUME_YES=1 to silence this warning."
    return 0
  fi

  case "${answer:-y}" in
    y|Y|yes|YES|"") ;;
    *) info "Aborted. To install elsewhere: cd to the desired directory, then re-run:"
       echo "  curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | bash"
       exit 0 ;;
  esac
}

# ── Clone or update ───────────────────────────────────────────────────────────

clone_or_update() {
  local dir="$1"
  if [[ -d "$dir/.git" ]]; then
    info "Existing checkout found — fetching latest ${BRANCH}..."
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  DRY: cd $dir && git fetch origin $BRANCH && git checkout $BRANCH && git pull --ff-only"
    else
      ( cd "$dir" && git fetch origin "$BRANCH" --quiet && git checkout "$BRANCH" --quiet && git pull --ff-only --quiet )
    fi
    ok "Updated $dir to latest $BRANCH"
  else
    info "Cloning ${REPO_URL} into ${dir}..."
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  DRY: git clone --branch $BRANCH $REPO_URL $dir"
    else
      git clone --branch "$BRANCH" --quiet "$REPO_URL" "$dir"
    fi
    ok "Cloned to $dir"
  fi
}

# ── Hand off to setup:fresh ───────────────────────────────────────────────────

run_setup() {
  local dir="$1"
  info "Running setup:fresh inside ${dir}..."
  echo ""
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "  DRY: cd $dir && npm run setup:fresh -- --from-installer ${EXTRA_ARGS[*]:-}"
    return 0
  fi
  ( cd "$dir" && npm run setup:fresh -- --from-installer "${EXTRA_ARGS[@]}" )
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "${BOLD}Banking demo bootstrapper${RESET}"
  echo ""

  # Pre-flight
  require_cmd git "  https://git-scm.com/downloads"
  check_node

  # Resolve target. We have to be defensive across three cases:
  #   1. INSTALL_DIR set (absolute or relative) → use it.
  #   2. INSTALL_DIR unset, $PWD valid          → $PWD/banking-demo.
  #   3. INSTALL_DIR unset, $PWD empty/missing  → fall back to `pwd` builtin.
  #
  # The previous implementation did `cd "$(dirname "$target")" && pwd` which
  # returned "/" when dirname produced "/", giving us "//banking-demo".
  local cwd="${PWD:-$(pwd 2>/dev/null)}"
  cwd="${cwd:-$HOME}"           # last-resort fallback if both PWD and pwd fail
  local target="${INSTALL_DIR:-${cwd}/${DEFAULT_DIR_NAME}}"

  # If relative, resolve against cwd.
  case "$target" in
    /*) ;;                            # already absolute
    *) target="${cwd}/${target}" ;;
  esac

  # Collapse repeated slashes (//foo, ///foo) and strip trailing slash.
  # Bash parameter expansion's `//\/\//\/` treatment of escapes is unreliable,
  # so we use sed — it's a coreutils binary, already required for the rest of
  # the script and has no install-script-specific risk.
  target="$(printf '%s' "$target" | sed 's|//*|/|g')"
  target="${target%/}"
  [[ -z "$target" ]] && target="/"

  local exists="no"
  [[ -d "$target" ]] && exists="yes"

  confirm_dir "$target" "$exists"

  if [[ "$exists" == "no" ]]; then
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  DRY: mkdir -p $(dirname "$target")"
    else
      mkdir -p "$(dirname "$target")"
    fi
  fi

  clone_or_update "$target"
  run_setup "$target"

  echo ""
  ok "Banking demo installed at: $target"
  echo ""
  echo "Start it any time with:"
  echo "  cd $target && ./run-bank.sh"
  echo ""
}

# Capture any extra args (e.g. tar archive path) to forward to setup:fresh.
EXTRA_ARGS=("$@")

main
