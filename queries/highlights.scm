; Identifiers

(identifier) @variable

((identifier) @constant
  (#match? @constant "^[A-Z][A-Z0-9_]*$"))

(const_statement name: (identifier) @constant)

(type_identifier) @type

((type_identifier) @type.builtin
  (#any-of? @type.builtin
    "Sample" "Float" "Int" "Bool" "Freq" "Pitch" "Time" "Interval" "Gain"))

(size_parameters (identifier) @type.parameter)
(size_arguments (identifier) @type.parameter)
(frame_type size: (identifier) @type.parameter)

(parameter name: (identifier) @variable.parameter)
(event_parameters (identifier) @variable.parameter)
(event_filter name: (identifier) @property)
(event_kind) @type.builtin
(argument name: (identifier) @variable.parameter)

; Definitions and calls

(function_definition name: (identifier) @function)
(rill_definition name: (identifier) @function)

(event_declaration name: (identifier) @function)
(sequence_declaration name: (identifier) @function)
(setting name: (identifier) @property)

(invoke_expression target: (identifier) @function.call)
(trigger_expression target: (identifier) @function.call)
(halt_expression target: (identifier) @function.call)
(event_handler event: (identifier) @function)

(call_expression function: (identifier) @function.call)
(pipe_expression function: (identifier) @function.call)

(field_identifier) @property

; Literals

(number) @number
(float) @number.float
(unit) @type.builtin
(boolean) @boolean

(line_comment) @comment
(block_comment) @comment

; Keywords

[
  "fn"
  "rill"
] @keyword.function

[
  "let"
  "state"
  "const"
  "event"
  "on"
] @keyword

(each) @keyword

"return" @keyword.return

[
  "for"
  "in"
] @keyword.repeat

[
  "seq"
  "invoke"
  "trigger"
  "halt"
  "claim"
  "release"
] @keyword

(rest) @punctuation.special

"as" @keyword.operator

[
  "if"
  "else"
] @keyword.conditional

(rate "rate" @keyword)

; Operators and punctuation

[
  "+"
  "-"
  "*"
  "/"
  "%"
  "!"
  "="
  "=="
  "!="
  "<"
  "<="
  ">"
  ">="
  "&&"
  "||"
  "|>"
  "@"
  "+="
  ".."
  "..="
] @operator

"." @punctuation.delimiter

(size_parameters ["<" ">"] @punctuation.bracket)
(size_arguments ["<" ">"] @punctuation.bracket)

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ":"
  ";"
] @punctuation.delimiter
