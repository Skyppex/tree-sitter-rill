; Scopes

(function_definition) @local.scope
(rill_definition) @local.scope
(block) @local.scope
(function) @local.scope
(for_statement) @local.scope
(event_handler) @local.scope

; Definitions

(parameter name: (identifier) @local.definition)
(size_parameters (identifier) @local.definition)
(let_statement name: (identifier) @local.definition)
(state_statement name: (identifier) @local.definition)
(const_statement name: (identifier) @local.definition)
(for_statement name: (identifier) @local.definition)
(event_handler parameters: (event_parameters (identifier) @local.definition))

; References

(identifier) @local.reference
