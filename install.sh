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
    if [[ -d "$target/.git" ]]; then
      echo "               (existing checkout — will fetch latest if remote matches)"
    else
      echo "               (directory exists — will refuse to clobber if non-empty)"
    fi
  else
    echo "               (directory will be created)"
  fi
  echo ""

  if [[ "${ASSUME_YES:-0}" == "1" ]]; then
    return 0
  fi

  if ask_yes_no "Proceed? [Y/n] " yes; then
    return 0
  fi

  info "Aborted. To install elsewhere: cd to the desired directory, then re-run:"
  echo "  curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | bash"
  exit 0
}

# Ask a yes/no question, reading from /dev/tty under curl-pipe (where stdin is
# the HTTP body). Second arg is the default ('yes' or 'no'). Returns 0 on yes,
# 1 on no. Returns the default if no TTY is available.
ask_yes_no() {
  local prompt="$1"
  local default="${2:-yes}"
  local answer=""
  if [[ -t 0 ]]; then
    read -r -p "$prompt" answer
  elif [[ -e /dev/tty ]] && (read -t 0 -n 0 </dev/tty) 2>/dev/null; then
    # /dev/tty exists AND is usable for input. shellcheck disable=SC2162
    read -p "$prompt" answer </dev/tty
  else
    [[ "${ASSUME_YES:-0}" == "1" ]] || warn "No TTY available — using default ($default). Set ASSUME_YES=1 to silence this warning."
    [[ "$default" == "yes" ]] && return 0 || return 1
  fi

  # Empty answer → default
  if [[ -z "$answer" ]]; then
    [[ "$default" == "yes" ]] && return 0 || return 1
  fi
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    n|N|no|NO)   return 1 ;;
    *) [[ "$default" == "yes" ]] && return 0 || return 1 ;;
  esac
}

# ── Clone or update ───────────────────────────────────────────────────────────

clone_or_update() {
  local dir="$1"

  # Existing-target handling:
  #   - $dir doesn't exist        → fresh clone (the happy path)
  #   - $dir is a file             → refuse (user pointed at a regular file)
  #   - $dir/.git exists, remote matches → fetch + ff-only pull
  #   - $dir/.git exists, remote different → refuse (probably a fork/unrelated repo)
  #   - $dir exists but is not a git repo → refuse unless empty
  if [[ -e "$dir" && ! -d "$dir" ]]; then
    err "Path exists and is not a directory: ${dir}"
    echo "" >&2
    echo "  Remove or rename it, then re-run." >&2
    exit 1
  fi

  if [[ -d "$dir/.git" ]]; then
    # Verify the existing checkout actually points at this repo. If it points
    # somewhere else (a fork, an unrelated project), pulling could destroy work.
    local existing_remote
    existing_remote="$( cd "$dir" && git remote get-url origin 2>/dev/null || echo '' )"
    if [[ -n "$existing_remote" && "$existing_remote" != "$REPO_URL" ]]; then
      err "Existing git repo at ${dir} has a different remote:"
      echo "    expected: ${REPO_URL}" >&2
      echo "    found:    ${existing_remote}" >&2
      echo "" >&2
      echo "  This is likely an unrelated checkout (a fork? a different project?)." >&2
      echo "  Pick a different install path, or remove ${dir} and re-run:" >&2
      echo "    curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | INSTALL_DIR=/some/other/path bash" >&2
      exit 1
    fi
    info "Existing checkout found — fetching latest ${BRANCH}..."
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "  DRY: cd $dir && git fetch origin $BRANCH && git checkout $BRANCH && git pull --ff-only"
    else
      ( cd "$dir" && git fetch origin "$BRANCH" --quiet && git checkout "$BRANCH" --quiet && git pull --ff-only --quiet )
    fi
    ok "Updated $dir to latest $BRANCH"
    return 0
  fi

  if [[ -d "$dir" ]]; then
    # Directory exists but isn't a git checkout. Empty dirs we'll use; non-empty
    # dirs we refuse so we don't clobber whatever's there.
    local entry_count
    entry_count=$(find "$dir" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$entry_count" != "0" ]]; then
      err "Directory exists and is not a git checkout: ${dir}"
      echo "" >&2
      echo "  ${dir} contains ${entry_count} file(s) we don't recognize." >&2
      echo "  This is probably an unrelated directory we shouldn't touch." >&2
      echo "" >&2
      echo "  Either remove it:" >&2
      echo "    rm -rf ${dir}" >&2
      echo "  Or install somewhere else:" >&2
      echo "    curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | INSTALL_DIR=/some/other/path bash" >&2
      exit 1
    fi
    # Empty existing dir — git clone refuses to clone INTO an existing dir,
    # so we remove the empty dir first. Safe because we just verified it's empty.
    info "Removing empty target directory before clone: ${dir}"
    [[ "${DRY_RUN:-0}" == "1" ]] || rmdir "$dir"
  fi

  info "Cloning ${REPO_URL} into ${dir}..."
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "  DRY: git clone --branch $BRANCH $REPO_URL $dir"
  else
    git clone --branch "$BRANCH" --quiet "$REPO_URL" "$dir"
  fi
  ok "Cloned to $dir"
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

  # When the user is at filesystem root or pointing INSTALL_DIR there, offer
  # to redirect to $HOME instead. macOS SIP makes / read-only; on Linux this
  # would need sudo. Almost certainly an accident — but we ask rather than
  # silently picking, since the user might have a non-standard reason.
  local parent
  parent="$(dirname "$target")"
  if [[ "$target" == "/${DEFAULT_DIR_NAME}" || "$parent" == "/" ]]; then
    warn "Cannot install at filesystem root: ${target}"
    if [[ -z "${HOME:-}" ]]; then
      err "\$HOME is unset — cannot suggest an alternate path."
      echo "" >&2
      echo "  Set INSTALL_DIR explicitly and re-run:" >&2
      echo "    curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | INSTALL_DIR=/path/to/banking-demo bash" >&2
      exit 1
    fi
    local suggested="${HOME%/}/${DEFAULT_DIR_NAME}"
    suggested="$(printf '%s' "$suggested" | sed 's|//*|/|g')"

    echo ""
    echo "  The filesystem root isn't writable (macOS SIP / Linux requires sudo)."
    echo "  Suggested install location:  ${BOLD}${suggested}${RESET}"
    echo ""
    if ask_yes_no "Install there instead? [Y/n] " yes; then
      target="$suggested"
      parent="$(dirname "$target")"
      ok "Redirecting to ${target}"
    else
      info "Aborted. cd into a writable directory and re-run:"
      echo "  cd ~ && curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | bash"
      echo "  # or pick another path explicitly:"
      echo "  curl -fsSL ${REPO_URL%.git}/raw/main/install.sh | INSTALL_DIR=/path/to/banking-demo bash"
      exit 0
    fi
  fi

  if [[ ! -w "$parent" ]]; then
    err "Cannot write to parent directory: ${parent}"
    cat >&2 <<EOF

  The installer needs write permission on the parent of the install path so it
  can create '${DEFAULT_DIR_NAME}/' there. Either:

    1. Pick a path you can write to:    INSTALL_DIR=~/banking-demo
    2. Fix permissions on ${parent}    (typically: chmod u+w "${parent}")

EOF
    exit 1
  fi

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
