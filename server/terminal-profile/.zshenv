# Runs BEFORE .zshrc — suppress the PROMPT_EOL_MARK (%) that renders as
# garbled "WWWWW" in xterm.js WebGL renderer
unsetopt PROMPT_CR PROMPT_SP

# Identify this as a DAW terminal
TERM_PROGRAM=DAWTerminal
DISABLE_AUTO_TITLE=true
