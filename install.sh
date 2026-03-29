#!/bin/bash
# Symphony AI Pipeline — Install Script
# Copies the framework into your project's .claude directory.
#
# Usage:
#   bash install.sh /path/to/your-project
#   bash install.sh .    # current directory

set -e

TARGET="${1:-.}"

if [ ! -d "$TARGET" ]; then
  echo "ERROR: Target directory '$TARGET' does not exist."
  exit 1
fi

if [ ! -d "$TARGET/.git" ]; then
  echo "WARNING: '$TARGET' is not a git repository."
  echo "Symphony works best with git. Continue? [y/N]"
  read -r answer
  if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    exit 0
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing Symphony AI Pipeline..."
echo "  Source: $SCRIPT_DIR/.claude"
echo "  Target: $TARGET/.claude"
echo ""

# Create target .claude if needed
mkdir -p "$TARGET/.claude"

# Copy framework files
cp -r "$SCRIPT_DIR/.claude/agents" "$TARGET/.claude/"
cp -r "$SCRIPT_DIR/.claude/hooks" "$TARGET/.claude/"
cp -r "$SCRIPT_DIR/.claude/rules" "$TARGET/.claude/"
cp -r "$SCRIPT_DIR/.claude/skills" "$TARGET/.claude/"
cp -r "$SCRIPT_DIR/.claude/dashboard" "$TARGET/.claude/"

# Copy config and state templates (don't overwrite if exists)
for f in settings.local.json pipeline-state.json deferred-work.json symphony.config.example.json; do
  if [ ! -f "$TARGET/.claude/$f" ]; then
    cp "$SCRIPT_DIR/.claude/$f" "$TARGET/.claude/"
  else
    echo "  SKIP: .claude/$f already exists"
  fi
done

# Make hooks executable
chmod +x "$TARGET/.claude/hooks/"*.sh 2>/dev/null || true

echo ""
echo "Symphony installed successfully!"
echo ""
echo "Next steps:"
echo "  1. cp .claude/symphony.config.example.json .claude/symphony.config.json"
echo "  2. Edit .claude/symphony.config.json with your project details"
echo "  3. Customize hooks in .claude/hooks/ for your stack"
echo "  4. Create a CLAUDE.md in your project root (see docs/CLAUDE.md.template)"
echo "  5. Run: claude --dangerously-skip-permissions \"/session-init\""
echo ""
echo "IMPORTANT: Always use --dangerously-skip-permissions when running Symphony."
echo "The pipeline requires autonomous execution (hundreds of tool calls per unit)."
echo "Safety is enforced by Symphony's 6 PreToolUse hooks, not permission prompts."
echo ""
echo "Required MCP servers: Linear, GitHub"
echo "Optional: Supabase, Playwright, Context7"
