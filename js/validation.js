// Data validation module for Quantickle
// Handles validation of all data inputs including CSV, API data, and graph structures

const Validation = {
    // Schema definitions
    schemas: {
        // Node schema
        node: {
            required: ['id', 'type', 'label'],
            properties: {
                id: {
                    type: 'string',
                    minLength: 1,
                    // Relaxed pattern to allow more characters
                    pattern: '^[a-zA-Z0-9_\\-\\.\\s]+$'
                },
                type: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 50
                },
                label: {
                    type: 'string',
                    maxLength: 200
                },
                timestamp: {
                    type: 'string',
                    maxLength: 50
                },
                size: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    default: 20
                },
                shape: {
                    type: 'string',
                    // Include 'circle' for compatibility with existing graph files
                    enum: [
                        'ellipse',
                        'rectangle',
                        'triangle',
                        'diamond',
                        'hexagon',
                        'octagon',
                        'pentagon',
                        'round-pentagon',
                        'star',
                        'round-rectangle',
                        'circle'
                    ],
                    default: 'round-rectangle'
                },
                color: {
                    type: 'string',
                    pattern: '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',
                    default: '#ffffff'
                },
                icon: {
                    type: 'string',
                    // Increased limit to accommodate larger base64-encoded icons
                    maxLength: 100000
                }
            }
        },

        // Edge schema
        edge: {
            required: ['id', 'source', 'target'],
            properties: {
                id: {
                    type: 'string',
                    minLength: 1,
                    // Relaxed pattern to allow more characters
                    pattern: '^[a-zA-Z0-9_\\-\\.\\s]+$'
                },
                source: {
                    type: 'string',
                    minLength: 1
                },
                target: {
                    type: 'string',
                    minLength: 1
                },
                label: {
                    type: 'string',
                    maxLength: 200
                },
                type: {
                    type: 'string',
                    maxLength: 50
                }
            }
        },

        // CSV row schema (full format)
        csvRowFull: {
            required: [
                'source_id',
                'source_type',
                'source_label',
                'target_id',
                'target_type',
                'target_label',
                'relationship_type'
            ],
            properties: {
                source_id: {
                    type: 'string',
                    minLength: 1,
                    // Relaxed pattern for CSV imports
                    pattern: '^[a-zA-Z0-9_\\-\\.\\s]+$'
                },
                source_type: {
                    type: 'string',
                    minLength: 1
                },
                source_label: {
                    type: 'string',
                    minLength: 1
                },
                target_id: {
                    type: 'string',
                    minLength: 1,
                    // Relaxed pattern for CSV imports
                    pattern: '^[a-zA-Z0-9_\\-\\.\\s]+$'
                },
                target_type: {
                    type: 'string',
                    minLength: 1
                },
                target_label: {
                    type: 'string',
                    minLength: 1
                },
                relationship_type: {
                    type: 'string',
                    minLength: 1
                },
                relationship_label: {
                    type: 'string'
                }
            }
        },

        // CSV row schema (simple format)
        csvRowSimple: {
            required: ['id', 'type', 'label'],
            properties: {
                id: {
                    type: 'string',
                    minLength: 1,
                    // Relaxed pattern for CSV imports
                    pattern: '^[a-zA-Z0-9_\\-\\.\\s]+$'
                },
                type: {
                    type: 'string',
                    minLength: 1
                },
                label: {
                    type: 'string',
                    minLength: 1
                }
            }
        }
    },

    // Validation functions
    validators: {
        // Validate node data with lenient mode
        validateNode: function(node, lenient = false) {
            const schema = Validation.schemas.node;
            const errors = [];

            // Check required fields
            schema.required.forEach(field => {
                if (!node[field]) {
                    errors.push(`Missing required field: ${field}`);
                }
            });

            // Validate properties
            Object.keys(node).forEach(field => {
                const fieldSchema = schema.properties[field];
                if (!fieldSchema) {
                    if (!lenient) {
                        errors.push(`Unknown field: ${field}`);
                    }
                    return;
                }

                const value = node[field];
                const fieldErrors = this.validateField(value, fieldSchema, lenient);
                errors.push(...fieldErrors.map(err => `${field}: ${err}`));
            });

            return {
                valid: errors.length === 0,
                errors: errors
            };
        },

        // Validate edge data with lenient mode
        validateEdge: function(edge, lenient = false) {
            const schema = Validation.schemas.edge;
            const errors = [];

            // Check required fields
            schema.required.forEach(field => {
                if (!edge[field]) {
                    errors.push(`Missing required field: ${field}`);
                }
            });

            // Validate properties
            Object.keys(edge).forEach(field => {
                const fieldSchema = schema.properties[field];
                if (!fieldSchema) {
                    if (!lenient) {
                        errors.push(`Unknown field: ${field}`);
                    }
                    return;
                }

                const value = edge[field];
                const fieldErrors = this.validateField(value, fieldSchema, lenient);
                errors.push(...fieldErrors.map(err => `${field}: ${err}`));
            });

            return {
                valid: errors.length === 0,
                errors: errors
            };
        },

        // Validate CSV row with lenient mode
        validateCsvRow: function(row, lenient = false) {
            // Determine format (full or simple)
            const isFull = row.hasOwnProperty('source_id') && row.hasOwnProperty('target_id');
            const schema = isFull ? Validation.schemas.csvRowFull : Validation.schemas.csvRowSimple;
            const errors = [];

            // Check required fields
            schema.required.forEach(field => {
                if (!row[field]) {
                    errors.push(`Missing required field: ${field}`);
                }
            });

            // Validate properties
            Object.keys(row).forEach(field => {
                const fieldSchema = schema.properties[field];
                if (!fieldSchema) {
                    if (!lenient) {
                        errors.push(`Unknown field: ${field}`);
                    }
                    return;
                }

                const value = row[field];
                const fieldErrors = this.validateField(value, fieldSchema, lenient);
                errors.push(...fieldErrors.map(err => `${field}: ${err}`));
            });

            return {
                valid: errors.length === 0,
                errors: errors
            };
        },

        // Validate a single field against its schema with lenient mode
        validateField: function(value, schema, lenient = false) {
            const errors = [];

            // Check type
            if (schema.type && typeof value !== schema.type) {
                errors.push(`Invalid type: expected ${schema.type}`);
                return errors;
            }

            // String validations
            if (schema.type === 'string') {
                if (schema.minLength && value.length < schema.minLength) {
                    errors.push(`Minimum length is ${schema.minLength}`);
                }
                if (schema.maxLength && value.length > schema.maxLength) {
                    errors.push(`Maximum length is ${schema.maxLength}`);
                }
                if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
                    if (!lenient) {
                        errors.push('Invalid format');
                    }
                }
                if (schema.enum && !schema.enum.includes(value)) {
                    errors.push(`Must be one of: ${schema.enum.join(', ')}`);
                }
            }

            // Number validations
            if (schema.type === 'number') {
                if (schema.minimum && value < schema.minimum) {
                    errors.push(`Minimum value is ${schema.minimum}`);
                }
                if (schema.maximum && value > schema.maximum) {
                    errors.push(`Maximum value is ${schema.maximum}`);
                }
            }

            return errors;
        },

        // Validate graph structure with lenient mode
        validateGraph: function(graph, lenient = false) {
            const errors = [];

            // Validate nodes
            if (!Array.isArray(graph.nodes)) {
                errors.push('nodes must be an array');
            } else {
                graph.nodes.forEach((node, index) => {
                    const nodeValidation = this.validateNode(node.data || {}, lenient);
                    errors.push(...nodeValidation.errors.map(err => `Node ${index}: ${err}`));
                });
            }

            // Validate edges
            if (!Array.isArray(graph.edges)) {
                errors.push('edges must be an array');
            } else {
                graph.edges.forEach((edge, index) => {
                    const edgeValidation = this.validateEdge(edge.data || {}, lenient);
                    errors.push(...edgeValidation.errors.map(err => `Edge ${index}: ${err}`));

                    // Validate edge references
                    const sourceExists = graph.nodes.some(node => node.data.id === edge.data.source);
                    const targetExists = graph.nodes.some(node => node.data.id === edge.data.target);

                    if (!sourceExists) {
                        errors.push(`Edge ${index}: source node '${edge.data.source}' not found`);
                    }
                    if (!targetExists) {
                        errors.push(`Edge ${index}: target node '${edge.data.target}' not found`);
                    }
                });
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };
        }
    },

    // Helper functions
    helpers: {
        // Parse and validate CSV string with lenient mode
        parseCsvRow: function(csvString, lenient = false) {
            const values = csvString.split(',').map(val => val.trim());
            const isFull = values.length >= 8;
            
            if (isFull) {
                const row = {
                    source_id: values[0],
                    source_type: values[1],
                    source_label: values[2],
                    target_id: values[3],
                    target_type: values[4],
                    target_label: values[5],
                    relationship_type: values[6],
                    relationship_label: values[7] || ''
                };
                return Validation.validators.validateCsvRow(row, lenient);
            } else if (values.length >= 3) {
                const row = {
                    id: values[0],
                    type: values[1],
                    label: values[2]
                };
                return Validation.validators.validateCsvRow(row, lenient);
            }

            return {
                valid: false,
                errors: ['Invalid CSV format']
            };
        },

        // Format validation errors for display
        formatErrors: function(validation) {
            if (validation.valid) {
                return null;
            }

            return {
                message: 'Validation failed',
                details: validation.errors,
                count: validation.errors.length
            };
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Validation;
} else {
    window.Validation = Validation;
}

