/**
 * @file Tree-sitter grammar for Rill, a language for real-time audio
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// This grammar is deliberately more permissive than the compiler. It exists
// for highlighting and editor tooling, so it should give a useful tree for
// code that is half-written or in the wrong place: any statement may appear
// at the top level or in any block, separators between statements are
// optional, and most parts of a construct after its leading keyword are
// optional. The compiler and LSP report what is actually wrong.

// Mirrors the precedence levels in src/lang/parser.rs, lowest first.
const PREC = {
  statement: -1,
  if: 1,
  assign: 0,
  pipe: 1,
  range: 2,
  or: 3,
  and: 4,
  compare: 5,
  sum: 6,
  term: 7,
  cast: 8,
  unary: 9,
  postfix: 10,
};

export default grammar({
  name: 'rill',

  // - `_newline`: a line break where it separates statements; the scanner
  //   decides when a line break does that (see src/scanner.c).
  // - `_on` and `_event` are keywords only when a name follows, so they stay
  //   usable as variable names.
  externals: $ => [
    $._newline,
    $.block_comment,
    $._on,
    $._event,
    $._seq,
    $._invoke,
    $._trigger,
    $._halt,
    $._claim,
    $._release,
    $._size_open,
    $._each,
    $._error_sentinel,
  ],

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  word: $ => $.identifier,

  // Always keywords, as in the compiler's lexer, even where a name would fit.
  // This lets error recovery restart at the next definition or statement
  // instead of reading e.g. `rill` as a parameter name after an unclosed `(`.
  reserved: {
    global: _ => [
      'fn', 'rill', 'let', 'state', 'const', 'import', 'export', 'return', 'if', 'else', 'as', 'for', 'in', 'true', 'false',
    ],
  },

  supertypes: $ => [$._statement, $._expression, $._type],

  rules: {
    source_file: $ => repeat($._statement_or_separator),

    _statement_or_separator: $ => choice($._statement, ';', $._newline),

    _statement: $ => choice(
      $.import_statement,
      $.export_statement,
      $.function_definition,
      $.rill_definition,
      $.event_declaration,
      $.sequence_declaration,
      $.event_handler,
      $.let_statement,
      $.state_statement,
      $.const_statement,
      $.assignment,
      $.return_statement,
      $.for_statement,
      $.expression_statement,
    ),

    // ---- modules ----------------------------------------------------------

    // `import "lib/osc"`: the path of another file, without `.rill`.
    import_statement: $ => prec.right(seq('import', optional(field('path', $.string)))),

    // `export` before a definition or an import makes it usable by files
    // that import this one.
    export_statement: $ => prec.right(seq(
      'export',
      optional(field('declaration', choice(
        $.function_definition,
        $.rill_definition,
        $.const_statement,
        $.event_declaration,
        $.sequence_declaration,
        $.import_statement,
      ))),
    )),

    string: _ => token(seq('"', /[^"\n]*/, '"')),

    // ---- definitions ------------------------------------------------------

    // A named fn. Without a name, `fn(...)` is an anonymous fn (`function`).
    function_definition: $ => prec.right(seq(
      'fn',
      field('name', $.identifier),
      optional($._signature),
    )),

    rill_definition: $ => prec.right(seq('rill', optional($._definition))),

    // Everything is optional so `rill`, `rill foo(` and `rill foo() Sample`
    // already give a definition node while it is being written.
    _definition: $ => prec.right(choice(
      seq(
        field('name', $.identifier),
        optional($._signature),
      ),
      $._signature,
    )),

    _signature: $ => prec.right(choice(
      seq(
        field('size_parameters', $.size_parameters),
        optional($._after_size_parameters),
      ),
      $._after_size_parameters,
    )),

    _after_size_parameters: $ => prec.right(choice(
      seq(field('parameters', $.parameters), optional($._after_parameters)),
      // Without `->` a return type is only recognised after the parameters;
      // `fn Sample` is a name.
      $._after_return,
    )),

    _after_parameters: $ => prec.right(choice(
      seq($._return, optional($._after_return)),
      $._after_return,
    )),

    // The return type follows the parameters directly: `rill foo() Sample`.
    _return: $ => field('return_type', $._type),

    _after_return: $ => prec.right(choice(
      seq(field('rate', $.rate), optional(field('body', $.block))),
      field('body', $.block),
    )),

    size_parameters: $ => seq('<', repeat(choice($.identifier, ',')), '>'),

    parameters: $ => seq('(', repeat(choice($.parameter, ',')), ')'),

    parameter: $ => prec.right(seq(
      field('name', $.identifier),
      optional(seq(':', optional(field('type', $._type)))),
      optional(seq('=', optional(field('default', $._expression)))),
    )),

    // `@ rate`, `@ rate / 2`, `@ rate * 2`
    rate: $ => prec.right(seq(
      '@',
      optional('rate'),
      optional(seq(
        field('operator', choice('*', '/')),
        optional(field('factor', $.integer)),
      )),
    )),

    // `event keys note_on(sender: 5, channel: 1)`: a name, a kind and
    // optional filters.
    event_declaration: $ => prec.right(seq(
      alias($._event, 'event'),
      field('name', $.identifier),
      optional(field('kind', alias($.identifier, $.event_kind))),
      optional(field('filters', $.event_filters)),
    )),

    event_filters: $ => seq('(', repeat(choice($.event_filter, ',')), ')'),

    // `channel: 1`
    event_filter: $ => prec.right(seq(
      field('name', $.identifier),
      optional(seq(':', optional(field('value', $._expression)))),
    )),

    // `on keys(note) { ... }`, `on keys(note) claim { ... }`,
    // `on keys release { ... }`, `on start { ... }`
    event_handler: $ => prec.right(seq(
      alias($._on, 'on'),
      field('event', $.identifier),
      optional(field('parameters', $.event_parameters)),
      optional(field('mode', $.handler_mode)),
      optional(field('body', $.block)),
    )),

    // How a handler shares notes over a voice pool.
    handler_mode: $ => choice(
      prec.right(seq(alias($._claim, 'claim'), optional(field('arguments', $.arguments)))),
      alias($._release, 'release'),
    ),

    // `seq riff(step: 1/8, tempo: 120bpm) { C4, _, E4@0.5, [G4, B4] }`
    sequence_declaration: $ => prec.right(seq(
      alias($._seq, 'seq'),
      field('name', $.identifier),
      optional(field('settings', $.settings)),
      optional(field('steps', $.steps)),
    )),

    settings: $ => seq('(', repeat(choice($.setting, ',')), ')'),

    // `tempo: 120bpm`
    setting: $ => prec.right(seq(
      field('name', $.identifier),
      optional(seq(':', optional(field('value', $._expression)))),
    )),

    // Steps may span lines; a line break is not a separator here.
    steps: $ => seq('{', repeat(choice($.step, ',')), '}'),

    // `C4`, `[G4, B4]@1`, `_`
    step: $ => prec.right(seq(
      field('notes', choice($.rest, $._expression)),
      optional(seq('@', optional(field('velocity', $._expression)))),
    )),

    rest: _ => '_',

    event_parameters: $ => seq('(', repeat(choice($.identifier, ',')), ')'),

    // ---- types ------------------------------------------------------------

    _type: $ => choice(
      alias($.identifier, $.type_identifier),
      $.frame_type,
      $.function_type,
    ),

    // `fn(Pitch) Freq`
    function_type: $ => prec.right(seq(
      'fn',
      field('parameters', $.parameter_types),
      optional(field('return_type', $._type)),
    )),

    parameter_types: $ => seq('(', repeat(choice($._type, ',')), ')'),

    frame_type: $ => seq(
      '[',
      optional(field('element', $._type)),
      optional(seq(';', optional(field('size', $._expression)))),
      ']',
    ),

    // ---- statements -------------------------------------------------------

    block: $ => seq('{', repeat($._statement_or_separator), '}'),

    let_statement: $ => prec.right(seq('let', optional($._binding))),

    state_statement: $ => prec.right(seq('state', optional($._binding))),

    // At the top level or in a block, like `let`.
    const_statement: $ => prec.right(seq('const', optional($._binding))),

    _binding: $ => prec.right(choice(
      seq(field('name', $.identifier), optional($._binding_rest)),
      $._binding_rest,
    )),

    _binding_rest: $ => prec.right(choice(
      seq(':', optional(field('type', $._type)), optional($._initializer)),
      $._initializer,
    )),

    _initializer: $ => prec.right(seq('=', optional(field('value', $._expression)))),

    // The compiler only assigns to names; any expression is accepted here.
    assignment: $ => prec.right(PREC.assign, seq(
      field('target', $._expression),
      field('operator', choice('=', '+=')),
      optional(field('value', $._expression)),
    )),

    // `for i in 0..N { ... }`, `for x in frame { ... }`
    for_statement: $ => prec.right(PREC.if, seq(
      'for',
      optional(field('name', $.identifier)),
      optional(seq('in', optional(field('iterator', $._expression)))),
      optional(field('body', $.block)),
    )),

    return_statement: $ => prec.right(seq('return', optional(field('value', $._expression)))),

    expression_statement: $ => prec(PREC.statement, $._expression),

    // ---- expressions ------------------------------------------------------

    _expression: $ => choice(
      $.number,
      $.boolean,
      $.identifier,
      $.unary_expression,
      $.binary_expression,
      $.range_expression,
      $.cast_expression,
      $.pipe_expression,
      $.call_expression,
      $.index_expression,
      $.field_expression,
      $.parenthesized_expression,
      $.frame,
      $.repeat_frame,
      $.if_expression,
      $.invoke_expression,
      $.trigger_expression,
      $.halt_expression,
      $.function,
      $.block,
    ),

    // An anonymous fn: `fn(p) { ... }`, `fn(p: Pitch) Freq { ... }`.
    function: $ => prec.right(seq(
      'fn',
      field('parameters', $.parameters),
      optional(field('return_type', $._type)),
      optional(field('body', $.block)),
    )),

    // `x |> f` and `x |> f(a)`, sugar for `f(x)` and `f(x, a)`.
    pipe_expression: $ => prec.left(PREC.pipe, seq(
      field('input', $._expression),
      '|>',
      $._pipe_target,
    )),

    // Separate so its arguments bind greedily: `x |> f(a)` passes `a` to `f`
    // rather than ending the pipe at `f`.
    _pipe_target: $ => prec.right(seq(
      field('function', $.identifier),
      optional(field('sizes', $.size_arguments)),
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

    // `0..N` or `1..=N`. While being typed the end may be missing; that
    // form is right-associative so an end that follows is always taken.
    range_expression: $ => choice(
      prec.left(PREC.range, seq(
        field('start', $._expression),
        field('operator', choice('..', '..=')),
        field('end', $._expression),
      )),
      prec.right(PREC.range, seq(
        field('start', $._expression),
        field('operator', choice('..', '..=')),
      )),
    ),

    // `x as Float`. While being typed the type may be missing; that form is
    // right-associative so a type that follows is always taken.
    cast_expression: $ => choice(
      prec.left(PREC.cast, seq(
        field('value', $._expression),
        'as',
        field('type', $._type),
      )),
      prec.right(PREC.cast, seq(field('value', $._expression), 'as')),
    ),

    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('-', '+', '!')),
      field('operand', $._expression),
    )),

    // `f(a)`, or with explicit sizes `f<4, N>(a)`.
    call_expression: $ => prec(PREC.postfix, seq(
      field('function', $.identifier),
      optional(field('sizes', $.size_arguments)),
      field('arguments', $.arguments),
    )),

    // `<4, N>`: sizes given by hand. The scanner only opens one where a
    // whole size list and `(` follow, as the compiler does, so `f < 4`
    // stays a comparison.
    size_arguments: $ => seq(
      alias($._size_open, '<'),
      repeat(choice($._size, ',')),
      '>',
    ),

    // A size in `<...>`: a number, a name, a field (`riff.step_count`), or
    // arithmetic of those. No comparisons, so `>` ends the list.
    _size: $ => choice(
      $.integer,
      $.identifier,
      alias($.size_field, $.field_expression),
      alias($.size_binary, $.binary_expression),
    ),

    size_field: $ => seq(
      field('value', $.identifier),
      '.',
      field('field', alias($.identifier, $.field_identifier)),
    ),

    size_binary: $ => choice(
      prec.left(PREC.sum, seq(
        field('left', $._size),
        field('operator', choice('+', '-')),
        field('right', $._size),
      )),
      prec.left(PREC.term, seq(
        field('left', $._size),
        field('operator', choice('*', '/', '%')),
        field('right', $._size),
      )),
    ),

    arguments: $ => seq('(', repeat(choice($.argument, ',')), ')'),

    argument: $ => prec.right(choice(
      seq(
        field('name', $.identifier),
        ':',
        optional(seq(optional(alias($._each, $.each)), field('value', $._expression))),
      ),
      seq(optional(alias($._each, $.each)), field('value', $._expression)),
    )),

    index_expression: $ => prec(PREC.postfix, seq(
      field('value', $._expression),
      '[',
      optional(field('index', $._expression)),
      ']',
    )),

    field_expression: $ => prec.right(PREC.postfix, seq(
      field('value', $._expression),
      '.',
      optional(field('field', alias($.identifier, $.field_identifier))),
    )),

    parenthesized_expression: $ => seq('(', optional($._expression), ')'),

    frame: $ => seq('[', repeat1(choice($._expression, ',')), ']'),

    // `[synth(); 8]`: eight separate instances.
    repeat_frame: $ => seq(
      '[',
      field('value', $._expression),
      ';',
      optional(field('count', $._expression)),
      ']',
    ),

    // An instance id or a step: `3`, `id`, `note.instance`.
    // As in the compiler, a name followed by another name is an id.
    _operand: $ => choice($.number, prec(1, $.identifier), $.operand_field),

    operand_field: $ => seq(
      field('value', $.identifier),
      repeat1(seq('.', field('field', alias($.identifier, $.field_identifier)))),
    ),

    // `invoke riff(tempo: 90bpm)`, `invoke id riff`, `invoke keys(pitch: C4)`
    invoke_expression: $ => prec.right(seq(
      alias($._invoke, 'invoke'),
      optional(field('id', $._operand)),
      field('target', $.identifier),
      optional(field('arguments', $.arguments)),
    )),

    // `trigger 3 riff`, `trigger 3 id riff(tempo: speed)`
    trigger_expression: $ => prec.right(seq(
      alias($._trigger, 'trigger'),
      field('step', $._operand),
      optional(field('id', $._operand)),
      field('target', $.identifier),
      optional(field('arguments', $.arguments)),
    )),

    // `halt riff`, `halt id riff`
    halt_expression: $ => prec.right(seq(
      alias($._halt, 'halt'),
      optional(field('id', $._operand)),
      field('target', $.identifier),
    )),

    if_expression: $ => prec.right(PREC.if, seq(
      'if',
      optional(field('condition', $._expression)),
      optional(field('consequence', $.block)),
      optional(seq(
        'else',
        optional(field('alternative', choice($.if_expression, $.block))),
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

    // `#` is a sharp, so only right after a note letter, as in `F#4`.
    identifier: _ => /[A-G]#[A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*/,

    line_comment: _ => token(seq('//', /[^\n]*/)),
  },
});
