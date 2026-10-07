/**
 * @file Tree-sitter grammar for Rill, a language for real-time audio
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Mirrors the precedence levels in src/lang/parser.rs, lowest first.
const PREC = {
  pipe: 1,
  or: 2,
  and: 3,
  compare: 4,
  sum: 5,
  term: 6,
  unary: 7,
  postfix: 8,
};

export default grammar({
  name: 'rill',

  // Statements end at a line break or `;`. The scanner decides when a line
  // break ends a statement (see src/scanner.c).
  // `on` is only a keyword when a name follows, so `on = 1` still assigns to
  // a variable called `on`; the scanner checks that too.
  externals: $ => [$._newline, $.block_comment, $._on, $._error_sentinel],

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  word: $ => $.identifier,

  supertypes: $ => [$._item, $._statement, $._expression, $._type],

  rules: {
    source_file: $ => repeat($._item),

    _item: $ => choice(
      $.function_definition,
      $.rill_definition,
      $.event_declaration,
    ),

    function_definition: $ => seq('fn', $._definition),

    rill_definition: $ => seq('rill', $._definition),

    _definition: $ => seq(
      field('name', $.identifier),
      optional(field('size_parameters', $.size_parameters)),
      field('parameters', $.parameters),
      '->',
      field('return_type', $._type),
      optional(field('rate', $.rate)),
      field('body', $.block),
    ),

    // `event note_on(note)`. Items start with a keyword, so unlike
    // statements no line break is needed to end one.
    event_declaration: $ => seq(
      'event',
      field('name', $.identifier),
      optional(field('parameters', $.event_parameters)),
      optional(';'),
    ),

    event_parameters: $ => seq('(', commaSep($.identifier), optional(','), ')'),

    size_parameters: $ => seq('<', commaSep1($.identifier), optional(','), '>'),

    parameters: $ => seq('(', commaSep($.parameter), optional(','), ')'),

    parameter: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
      optional(seq('=', field('default', $._expression))),
    ),

    // `@ rate`, `@ rate / 2`, `@ rate * 2`
    rate: $ => seq(
      '@',
      'rate',
      optional(seq(
        field('operator', choice('*', '/')),
        field('factor', $.integer),
      )),
    ),

    _type: $ => choice(alias($.identifier, $.type_identifier), $.frame_type),

    frame_type: $ => seq(
      '[',
      field('element', $._type),
      ';',
      field('size', choice($.integer, $.identifier)),
      ']',
    ),

    // An event handler needs no terminator after its `}`, as in the compiler.
    block: $ => seq(
      '{',
      repeat(choice(seq($._statement, $._terminator), $.event_handler)),
      optional($._statement),
      '}',
    ),

    _terminator: $ => choice(';', $._newline),

    _statement: $ => choice(
      $.let_statement,
      $.state_statement,
      $.assignment,
      $.return_statement,
      $.expression_statement,
    ),

    let_statement: $ => seq(
      'let',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
    ),

    state_statement: $ => seq(
      'state',
      field('name', $.identifier),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
    ),

    assignment: $ => seq(
      field('target', $.identifier),
      '=',
      field('value', $._expression),
    ),

    // `on note_on(note) { ... }`
    event_handler: $ => seq(
      alias($._on, 'on'),
      field('event', $.identifier),
      optional(field('parameters', $.event_parameters)),
      field('body', $.block),
    ),

    return_statement: $ => seq('return', field('value', $._expression)),

    expression_statement: $ => $._expression,

    _expression: $ => choice(
      $.number,
      $.boolean,
      $.identifier,
      $.unary_expression,
      $.binary_expression,
      $.pipe_expression,
      $.call_expression,
      $.index_expression,
      $.field_expression,
      $.parenthesized_expression,
      $.frame,
      $.if_expression,
      $.block,
    ),

    // `x |> f` and `x |> f(a)`, sugar for `f(x)` and `f(x, a)`.
    pipe_expression: $ => prec.left(PREC.pipe, seq(
      field('input', $._expression),
      '|>',
      field('function', $.identifier),
      optional(field('arguments', $.arguments)),
    )),

    binary_expression: $ => {
      const table = [
        [PREC.or, '||'],
        [PREC.and, '&&'],
        [PREC.compare, choice('<', '<=', '>', '>=', '==', '!=')],
        [PREC.sum, choice('+', '-')],
        [PREC.term, choice('*', '/', '%')],
      ];
      return choice(...table.map(([p, op]) => prec.left(p, seq(
        field('left', $._expression),
        // @ts-ignore
        field('operator', op),
        field('right', $._expression),
      ))));
    },

    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('-', '+', '!')),
      field('operand', $._expression),
    )),

    call_expression: $ => prec(PREC.postfix, seq(
      field('function', $.identifier),
      field('arguments', $.arguments),
    )),

    arguments: $ => seq('(', commaSep($.argument), optional(','), ')'),

    argument: $ => seq(
      optional(seq(field('name', $.identifier), ':')),
      field('value', $._expression),
    ),

    index_expression: $ => prec(PREC.postfix, seq(
      field('value', $._expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    field_expression: $ => prec(PREC.postfix, seq(
      field('value', $._expression),
      '.',
      field('field', alias($.identifier, $.field_identifier)),
    )),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    frame: $ => seq('[', commaSep1($._expression), optional(','), ']'),

    if_expression: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      field('consequence', $.block),
      optional(seq(
        'else',
        field('alternative', choice($.if_expression, $.block)),
      )),
    )),

    // `440Hz`, `0.5`, `48_000`, `1e-3`, `300ms`
    number: $ => seq(
      field('value', choice($.integer, $.float)),
      optional(field('unit', $.unit)),
    ),

    integer: _ => /\d[\d_]*/,

    float: _ => token(choice(
      /\d[\d_]*\.\d[\d_]*([eE][+-]?\d[\d_]*)?/,
      /\d[\d_]*[eE][+-]?\d[\d_]*/,
    )),

    unit: _ => token.immediate(/[A-Za-z_][A-Za-z0-9_]*/),

    boolean: _ => choice('true', 'false'),

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

    line_comment: _ => token(seq('//', /[^\n]*/)),
  },
});

/**
 * @param {RuleOrLiteral} rule
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * @param {RuleOrLiteral} rule
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}
