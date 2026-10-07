(block
  "{" @delimiter
  "}" @delimiter @sentinel) @container

(parameters
  "(" @delimiter
  ")" @delimiter @sentinel) @container

(size_parameters
  "<" @delimiter
  ">" @delimiter @sentinel) @container

(event_parameters
  "(" @delimiter
  ")" @delimiter @sentinel) @container

(arguments
  "(" @delimiter
  ")" @delimiter @sentinel) @container

(parenthesized_expression
  "(" @delimiter
  ")" @delimiter @sentinel) @container

(frame
  "[" @delimiter
  "]" @delimiter @sentinel) @container

(frame_type
  "[" @delimiter
  "]" @delimiter @sentinel) @container

(index_expression
  "[" @delimiter
  "]" @delimiter @sentinel) @container
