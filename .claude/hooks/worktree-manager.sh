#!/bin/bash
# Symphony AI Pipeline — Worktree Manager
# Manages git worktrees for parallel track execution.
#
# Usage:
#   bash .claude/hooks/worktree-manager.sh <action> [args...]
#
# Actions:
#   create <track_id> <base_branch>    — Create worktree for a track
#   merge <track_id> <target_branch>   — Merge worktree branch into target
#   cleanup <track_id>                 — Remove a worktree
#   cleanup-all                        — Remove all symphony worktrees
#   list                               — List active worktrees

set -e

WORKTREE_DIR=".claude/worktrees"
ACTION="$1"
shift || true

case "$ACTION" in
  create)
    TRACK_ID="$1"
    BASE_BRANCH="$2"
    if [ -z "$TRACK_ID" ] || [ -z "$BASE_BRANCH" ]; then
      echo "Usage: create <track_id> <base_branch>"
      exit 1
    fi
    WORKTREE_PATH="${WORKTREE_DIR}/${TRACK_ID}"
    BRANCH_NAME="symphony/${TRACK_ID}"

    # Ensure base branch is up to date
    git fetch origin "$BASE_BRANCH" 2>/dev/null || true

    # Create worktree with a new branch based on the feature branch
    mkdir -p "$WORKTREE_DIR"
    git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$BASE_BRANCH" 2>&1

    echo "Worktree created:"
    echo "  Path:   $WORKTREE_PATH"
    echo "  Branch: $BRANCH_NAME"
    echo "  Base:   $BASE_BRANCH"
    ;;

  merge)
    TRACK_ID="$1"
    TARGET_BRANCH="$2"
    if [ -z "$TRACK_ID" ] || [ -z "$TARGET_BRANCH" ]; then
      echo "Usage: merge <track_id> <target_branch>"
      exit 1
    fi
    BRANCH_NAME="symphony/${TRACK_ID}"

    # Check if the branch has commits ahead of target
    AHEAD=$(git rev-list --count "${TARGET_BRANCH}..${BRANCH_NAME}" 2>/dev/null || echo "0")
    if [ "$AHEAD" = "0" ]; then
      echo "No commits to merge from ${BRANCH_NAME}"
      exit 0
    fi

    # Merge with --no-ff to preserve track history
    echo "Merging ${BRANCH_NAME} into ${TARGET_BRANCH} (${AHEAD} commits)..."
    git checkout "$TARGET_BRANCH" 2>/dev/null
    git merge --no-ff "$BRANCH_NAME" -m "merge: track ${TRACK_ID} into ${TARGET_BRANCH}" 2>&1

    if [ $? -eq 0 ]; then
      echo "Merge successful: ${BRANCH_NAME} → ${TARGET_BRANCH}"
    else
      echo "MERGE CONFLICT: ${BRANCH_NAME} → ${TARGET_BRANCH}"
      echo "Resolve conflicts manually, then run: git merge --continue"
      exit 1
    fi
    ;;

  cleanup)
    TRACK_ID="$1"
    if [ -z "$TRACK_ID" ]; then
      echo "Usage: cleanup <track_id>"
      exit 1
    fi
    WORKTREE_PATH="${WORKTREE_DIR}/${TRACK_ID}"
    BRANCH_NAME="symphony/${TRACK_ID}"

    # Remove worktree
    if [ -d "$WORKTREE_PATH" ]; then
      git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
      echo "Worktree removed: $WORKTREE_PATH"
    fi

    # Delete the branch
    git branch -d "$BRANCH_NAME" 2>/dev/null || git branch -D "$BRANCH_NAME" 2>/dev/null || true
    echo "Branch deleted: $BRANCH_NAME"
    ;;

  cleanup-all)
    echo "Cleaning up all symphony worktrees..."
    if [ -d "$WORKTREE_DIR" ]; then
      for dir in "$WORKTREE_DIR"/*/; do
        [ -d "$dir" ] || continue
        TRACK_ID=$(basename "$dir")
        git worktree remove "$dir" --force 2>/dev/null || true
        git branch -D "symphony/${TRACK_ID}" 2>/dev/null || true
        echo "  Removed: $TRACK_ID"
      done
    fi
    # Prune stale worktree references
    git worktree prune 2>/dev/null || true
    echo "All symphony worktrees cleaned up"
    ;;

  list)
    echo "Symphony Worktrees:"
    if [ -d "$WORKTREE_DIR" ]; then
      for dir in "$WORKTREE_DIR"/*/; do
        [ -d "$dir" ] || continue
        TRACK_ID=$(basename "$dir")
        BRANCH=$(git -C "$dir" branch --show-current 2>/dev/null || echo "unknown")
        COMMITS=$(git rev-list --count HEAD.."$BRANCH" 2>/dev/null || echo "?")
        echo "  ${TRACK_ID}: branch=${BRANCH} commits=${COMMITS}"
      done
    else
      echo "  (none)"
    fi
    ;;

  *)
    echo "Worktree Manager — Actions:"
    echo "  create <track_id> <base_branch>"
    echo "  merge <track_id> <target_branch>"
    echo "  cleanup <track_id>"
    echo "  cleanup-all"
    echo "  list"
    exit "${ACTION:+1}"
    ;;
esac
