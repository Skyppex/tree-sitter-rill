// External scanner for Rill.
//
// Three tokens need more than a regex:
//
// - `_newline` ends a statement at a line break. It is only produced where
//   the grammar allows a statement terminator, which matches the compiler's
//   rule that line breaks are ignored inside `(...)` and `[...]`. A line that
//   starts with `|>` or `else` continues the previous one instead, so
//   pipelines can be written one stage per line.
// - `block_comment` nests, as in `/* a /* b */ c */`.
// - `on` starts an event handler only when a name follows, as in
//   `on note_on(note) { ... }`. Elsewhere `on` is an ordinary name.

#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <string.h>

enum TokenType {
  NEWLINE,
  BLOCK_COMMENT,
  ON,
  ERROR_SENTINEL,
};

void *tree_sitter_rill_external_scanner_create(void) { return NULL; }

void tree_sitter_rill_external_scanner_destroy(void *payload) {}

unsigned tree_sitter_rill_external_scanner_serialize(void *payload, char *buffer) { return 0; }

void tree_sitter_rill_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool is_ident_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_';
}

static bool is_space(int32_t c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

// Consume the rest of a block comment whose `/*` has been consumed. Returns
// false if the input ends first. Sets `*newline` if it spans a line break.
static bool finish_block_comment(TSLexer *lexer, bool *newline) {
  unsigned depth = 1;
  while (depth > 0) {
    if (lexer->eof(lexer)) return false;
    int32_t c = lexer->lookahead;
    advance(lexer);
    if (c == '\n') {
      *newline = true;
    } else if (c == '/' && lexer->lookahead == '*') {
      advance(lexer);
      depth++;
    } else if (c == '*' && lexer->lookahead == '/') {
      advance(lexer);
      depth--;
    }
  }
  return true;
}

// Consume whitespace and comments. Returns false, having consumed it, if a
// `/` turns out not to start a comment, or if a block comment is unclosed.
static bool skip_trivia(TSLexer *lexer) {
  for (;;) {
    while (is_space(lexer->lookahead)) advance(lexer);
    if (lexer->lookahead != '/') return true;
    advance(lexer);
    if (lexer->lookahead == '/') {
      while (!lexer->eof(lexer) && lexer->lookahead != '\n') advance(lexer);
    } else if (lexer->lookahead == '*') {
      advance(lexer);
      bool newline = false;
      if (!finish_block_comment(lexer, &newline)) return false;
    } else {
      return false;
    }
  }
}

// Consume `word` if the input continues with it as a whole word.
static bool eat_word(TSLexer *lexer, const char *word) {
  for (const char *p = word; *p; p++) {
    if (lexer->lookahead != *p) return false;
    advance(lexer);
  }
  return !is_ident_char(lexer->lookahead);
}

// The lexer is at the first token after a line break, with the `_newline`
// token already marked as ending before it. Decide whether that token
// continues the previous line, looking past any comments in between.
static bool continues_line(TSLexer *lexer) {
  if (!skip_trivia(lexer)) return false;
  if (lexer->lookahead == '|') {
    advance(lexer);
    return lexer->lookahead == '>';
  }
  return lexer->lookahead == 'e' && eat_word(lexer, "else");
}

static const char *const KEYWORDS[] = {
    "fn", "rill", "state", "let", "return", "if", "else", "true", "false",
};

// The lexer is at `on`. It is a keyword if a name, not a keyword, follows.
static bool scan_on(TSLexer *lexer) {
  if (!eat_word(lexer, "on")) return false;
  lexer->mark_end(lexer);
  if (!skip_trivia(lexer)) return false;

  char word[8];
  unsigned len = 0;
  int32_t c = lexer->lookahead;
  if (!is_ident_char(c) || (c >= '0' && c <= '9')) return false;
  while (is_ident_char(lexer->lookahead)) {
    if (len < sizeof word - 1) word[len] = (char)lexer->lookahead;
    len++;
    advance(lexer);
  }
  if (len >= sizeof word) return true;
  word[len] = 0;
  for (unsigned i = 0; i < sizeof KEYWORDS / sizeof *KEYWORDS; i++) {
    if (strcmp(word, KEYWORDS[i]) == 0) return false;
  }
  return true;
}

bool tree_sitter_rill_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  // During error recovery every symbol is valid; only comments are safe to
  // produce then.
  bool want_newline = valid_symbols[NEWLINE] && !valid_symbols[ERROR_SENTINEL];

  bool newline = false;
  while (is_space(lexer->lookahead)) {
    if (lexer->lookahead == '\n') newline = true;
    skip(lexer);
  }

  if (newline && want_newline) {
    lexer->result_symbol = NEWLINE;
    lexer->mark_end(lexer);
    return !continues_line(lexer);
  }

  if (valid_symbols[BLOCK_COMMENT] && lexer->lookahead == '/') {
    // A comment spanning lines ends the statement like a line break would,
    // so a `_newline` may have to come first. Mark it before the comment.
    lexer->mark_end(lexer);
    advance(lexer);
    if (lexer->lookahead != '*') return false;
    advance(lexer);
    bool spans_lines = false;
    if (!finish_block_comment(lexer, &spans_lines)) return false;
    if (spans_lines && want_newline) {
      lexer->result_symbol = NEWLINE;
      return !continues_line(lexer);
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = BLOCK_COMMENT;
    return true;
  }

  if (valid_symbols[ON] && !valid_symbols[ERROR_SENTINEL] && lexer->lookahead == 'o') {
    lexer->result_symbol = ON;
    return scan_on(lexer);
  }

  return false;
}
