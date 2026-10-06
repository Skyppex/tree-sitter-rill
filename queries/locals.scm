; Scopes

(function_definition) @local.scope
(rill_definition) @local.scope
(block) @local.scope

; Definitions

(parameter name: (identifier) @local.definition)
(size_parameters (identifier) @local.definition)
(let_statement name: (identifier) @local.definition)
(state_statement name: (identifier) @local.definition)

; References

(identifier) @local.reference
