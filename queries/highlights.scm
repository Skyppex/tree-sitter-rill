; Identifiers

(identifier) @variable

((identifier) @constant
  (#match? @constant "^[A-Z][A-Z0-9_]*$"))

(type_identifier) @type

((type_identifier) @type.builtin
  (#any-of? @type.builtin
    "sample" "f32" "i32" "bool" "Hz" "Time" "Interval" "Pitch" "Chord"))

(size_parameters (identifier) @type.parameter)
(frame_type size: (identifier) @type.parameter)

(parameter name: (identifier) @variable.parameter)
(argument name: (identifier) @variable.parameter)

; Definitions and calls

(function_definition name: (identifier) @function)
(rill_definition name: (identifier) @function)

(call_expression function: (identifier) @function.call)
(pipe_expression function: (identifier) @function.call)

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
] @keyword

"return" @keyword.return

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
  "->"
  "@"
] @operator

(size_parameters ["<" ">"] @punctuation.bracket)

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
