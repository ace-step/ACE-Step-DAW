# Minimal zsh config for the DAW embedded terminal.
# Clean prompt that works without Nerd Fonts.

# Source user's aliases (including `claude` alias)
if [[ -f ~/.zshrc ]]; then
  eval "$(grep -E '^\s*(alias |export )' ~/.zshrc 2>/dev/null)"
fi

# Clean prompt
PROMPT='%F{cyan}%1~%f %F{yellow}>%f '
RPROMPT=''
