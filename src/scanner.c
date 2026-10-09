// External scanner for Rill.
//
// These tokens need more than a regex:
//
// - `_newline` separates statements at a line break, so `a` followed by `-b`
//   on the next line is two statements. It is only produced where the
//   grammar allows a separator, which matches the compiler's rule that line
//   breaks are ignored inside `(...)` and `[...]`. A line that starts with
//   `|>`, `else` or `{` continues the previous one instead, so pipelines can
//   be written one stage per line and braces can go on their own line.
// - `block_comment` nests, as in `/* a /* b */ c */`.
// - `on`, `event` and `seq` are keywords only when a name follows, as in
//   `on note_on(note) { ... }`. Elsewhere they are ordinary names.
// - `invoke`, `trigger` and `halt` are keywords when a name or a number
//   follows (`invoke riff`, `trigger 3 riff`).
// - `claim` is a keyword before `{` or `(`, and `release` before `{`, as in
//   `on keys(note) claim { ... }`.
// - `each` is a keyword before an argument's value when something that
//   starts an expression follows on the same line: a name, a number, `[`,
//   `!`, or `(` after a space (`each(x)` calls a fn named `each`).
// - `_size_open` is the `<` of explicit size arguments, `f<4, N>(x)`. As in
//   the compiler, it is one only when names or numbers separated by commas,
//   a `>` and then `(` follow on the same line; otherwise `<` compares.

#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <string.h>

enum TokenType {
  NEWLINE,
  BLOCK_COMMENT,
  ON,
  EVENT,
  SEQ,
  INVOKE,
  TRIGGER,
  HALT,
  CLAIM,
  RELEASE,
  SIZE_OPEN,
  EACH,
  ERROR_SENTINEL,
};

typedef struct {
  // The last token was a block comment spanning lines, which separates
  // statements like a line break.
  bool comment_had_newline;
} Scanner;

void *tree_sitter_rill_external_scanner_create(void) { return ts_calloc(1, sizeof(Scanner)); }

void tree_sitter_rill_external_scanner_destroy(void *payload) { ts_free(payload); }

unsigned tree_sitter_rill_external_scanner_serialize(void *payload, char *buffer) {
  Scanner *scanner = payload;
  buffer[0] = (char)scanner->comment_had_newline;
  return 1;
}

void tree_sitter_rill_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = payload;
  scanner->comment_had_newline = length > 0 && buffer[0];
}

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
  if (lexer->lookahead == '{') return true;
  if (lexer->lookahead == '|') {
    advance(lexer);
    return lexer->lookahead == '>';
  }
  return lexer->lookahead == 'e' && eat_word(lexer, "else");
}

static const char *const KEYWORDS[] = {
    "fn", "rill", "state", "let", "return", "if", "else", "true", "false",
};

// Scan `keyword`, which counts as one only if a name, not a keyword, follows.
static bool scan_contextual(TSLexer *lexer, const char *keyword) {
  if (!eat_word(lexer, keyword)) return false;
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

// Scan `keyword`, which counts as one only if a name or a number follows.
// The operand must be on the same line, as in the compiler.
static bool scan_before_operand(TSLexer *lexer, const char *keyword) {
  if (!eat_word(lexer, keyword)) return false;
  lexer->mark_end(lexer);
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
  return is_ident_char(lexer->lookahead);
}

// Scan `keyword`, which counts as one only if `{` (or, with `paren`, `(`)
// follows.
static bool scan_before_brace(TSLexer *lexer, const char *keyword, bool paren) {
  if (!eat_word(lexer, keyword)) return false;
  lexer->mark_end(lexer);
  if (!skip_trivia(lexer)) return false;
  return lexer->lookahead == '{' || (paren && lexer->lookahead == '(');
}

static void skip_spaces(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
}

// Scan `each` before an argument's value. A word after it must not be one
// that continues an expression (`each as Float` casts a name `each`).
static bool scan_each(TSLexer *lexer) {
  if (!eat_word(lexer, "each")) return false;
  lexer->mark_end(lexer);
  bool spaced = lexer->lookahead == ' ' || lexer->lookahead == '\t';
  skip_spaces(lexer);
  int32_t c = lexer->lookahead;
  if (c == '[' || c == '!') return true;
  if (c == '(') return spaced;
  if (!is_ident_char(c)) return false;
  char word[5];
  unsigned len = 0;
  while (is_ident_char(lexer->lookahead)) {
    if (len < sizeof word - 1) word[len] = (char)lexer->lookahead;
    len++;
    advance(lexer);
  }
  if (len >= sizeof word) return true;
  word[len] = 0;
  return strcmp(word, "as") != 0 && strcmp(word, "in") != 0 && strcmp(word, "else") != 0;
}

// At `<`: consume it, and check that `a, 4, N>(` follows.
static bool scan_size_open(TSLexer *lexer) {
  advance(lexer);
  lexer->mark_end(lexer);
  for (;;) {
    skip_spaces(lexer);
    if (!is_ident_char(lexer->lookahead)) return false;
    while (is_ident_char(lexer->lookahead)) advance(lexer);
    skip_spaces(lexer);
    if (lexer->lookahead == ',') {
      advance(lexer);
      continue;
    }
    if (lexer->lookahead != '>') return false;
    advance(lexer);
    skip_spaces(lexer);
    return lexer->lookahead == '(';
  }
}

bool tree_sitter_rill_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  Scanner *scanner = payload;
  // During error recovery every symbol is valid; only comments are safe to
  // produce then.
  bool want_newline = valid_symbols[NEWLINE] && !valid_symbols[ERROR_SENTINEL];

  bool newline = scanner->comment_had_newline;
  scanner->comment_had_newline = false;
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
    advance(lexer);
    if (lexer->lookahead != '*') return false;
    advance(lexer);
    bool spans_lines = false;
    if (!finish_block_comment(lexer, &spans_lines)) return false;
    // Produce the `_newline` on the next scan, after the comment.
    scanner->comment_had_newline = spans_lines;
    lexer->mark_end(lexer);
    lexer->result_symbol = BLOCK_COMMENT;
    return true;
  }

  if (!valid_symbols[ERROR_SENTINEL]) {
    if (valid_symbols[SIZE_OPEN] && !newline && lexer->lookahead == '<') {
      lexer->result_symbol = SIZE_OPEN;
      return scan_size_open(lexer);
    }
    if (valid_symbols[ON] && lexer->lookahead == 'o') {
      lexer->result_symbol = ON;
      return scan_contextual(lexer, "on");
    }
    if (valid_symbols[EACH] && lexer->lookahead == 'e') {
      lexer->result_symbol = EACH;
      return scan_each(lexer);
    }
    if (valid_symbols[EVENT] && lexer->lookahead == 'e') {
      lexer->result_symbol = EVENT;
      return scan_contextual(lexer, "event");
    }
    if (valid_symbols[SEQ] && lexer->lookahead == 's') {
      lexer->result_symbol = SEQ;
      return scan_contextual(lexer, "seq");
    }
    if (valid_symbols[INVOKE] && lexer->lookahead == 'i') {
      lexer->result_symbol = INVOKE;
      return scan_before_operand(lexer, "invoke");
    }
    if (valid_symbols[TRIGGER] && lexer->lookahead == 't') {
      lexer->result_symbol = TRIGGER;
      return scan_before_operand(lexer, "trigger");
    }
    if (valid_symbols[HALT] && lexer->lookahead == 'h') {
      lexer->result_symbol = HALT;
      return scan_before_operand(lexer, "halt");
    }
    if (valid_symbols[CLAIM] && lexer->lookahead == 'c') {
      lexer->result_symbol = CLAIM;
      return scan_before_brace(lexer, "claim", true);
    }
    if (valid_symbols[RELEASE] && lexer->lookahead == 'r') {
      lexer->result_symbol = RELEASE;
      return scan_before_brace(lexer, "release", false);
    }
  }

  return false;
}
