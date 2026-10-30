// What the AI returns when it reads the photos of a supplier label (stage 7e).
// The AI only TRANSCRIBES: it copies what is printed and says how legible it is.
// Interpreting (which row is which nutrient, units, allergens, added sugar/fat/salt)
// is done by the code in convert.js, with fixed rules that can be tested.
//
// Format: the OpenAPI subset accepted by Gemini's `responseSchema`.

const STRING = { type: 'STRING' };
const NULLABLE_STRING = { type: 'STRING', nullable: true };
const NULLABLE_NUMBER = { type: 'NUMBER', nullable: true };

/** clear: read without doubt; doubtful: read but some character may be wrong; illegible: cannot be read. */
export const LEGIBILITY = ['clear', 'doubtful', 'illegible'];
const legibility = { type: 'STRING', enum: LEGIBILITY };

/** A printed value: the exact text (with "?" for unreadable characters), the number in it, how legible it is. */
const cell = {
  type: 'OBJECT',
  nullable: true,
  properties: {
    text: STRING,
    value: NULLABLE_NUMBER,
    legibility,
  },
  required: ['text', 'value', 'legibility'],
  propertyOrdering: ['text', 'value', 'legibility'],
};

/** A printed text block (ingredients, allergen statement, storage…). */
const textBlock = {
  type: 'OBJECT',
  nullable: true,
  properties: {
    text: STRING,
    legibility,
  },
  required: ['text', 'legibility'],
  propertyOrdering: ['text', 'legibility'],
};

export const TRANSCRIPTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    images: {
      type: 'ARRAY',
      description: 'One entry per image, in the order received.',
      items: {
        type: 'OBJECT',
        properties: {
          index: { type: 'INTEGER' },
          shows: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: ['nutrition_table', 'ingredients', 'allergens', 'front', 'supplier_data', 'dates', 'other'] },
          },
          problems: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: ['glare', 'blurry', 'cut_off', 'too_far', 'tilted', 'dark', 'covered'] },
          },
          note: NULLABLE_STRING,
        },
        required: ['index', 'shows', 'problems'],
        propertyOrdering: ['index', 'shows', 'problems', 'note'],
      },
    },
    product_name: NULLABLE_STRING,
    nutrition_table: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        title: NULLABLE_STRING,
        serving_text: { ...textBlock, description: 'Serving line exactly as printed, e.g. "Porción: 1/4 taza (30 g)".' },
        serving_g: NULLABLE_NUMBER,
        household_measure: NULLABLE_STRING,
        servings_per_package_text: NULLABLE_STRING,
        per_100_header: NULLABLE_STRING,
        per_serving_header: NULLABLE_STRING,
        other_column_headers: { type: 'ARRAY', items: STRING },
        rows: {
          type: 'ARRAY',
          description: 'Every row of the table, top to bottom, as printed.',
          items: {
            type: 'OBJECT',
            properties: {
              label: STRING,
              unit: NULLABLE_STRING,
              per_100: cell,
              per_serving: cell,
            },
            required: ['label', 'unit', 'per_100', 'per_serving'],
            propertyOrdering: ['label', 'unit', 'per_100', 'per_serving'],
          },
        },
        notes_below_table: { type: 'ARRAY', items: STRING },
      },
      required: ['serving_text', 'serving_g', 'household_measure', 'per_100_header', 'per_serving_header', 'rows'],
      propertyOrdering: ['title', 'serving_text', 'serving_g', 'household_measure', 'servings_per_package_text',
        'per_100_header', 'per_serving_header', 'other_column_headers', 'rows', 'notes_below_table'],
    },
    ingredients: textBlock,
    contains_statement: textBlock,
    may_contain_statement: textBlock,
    other_allergen_statements: { type: 'ARRAY', items: { ...textBlock, nullable: false } },
    origin: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        text: STRING,
        country: NULLABLE_STRING,
        explicit: { type: 'BOOLEAN' },
      },
      required: ['text', 'country', 'explicit'],
      propertyOrdering: ['text', 'country', 'explicit'],
    },
    storage: textBlock,
    usage_instructions: textBlock,
    shelf_life_text: NULLABLE_STRING,
    production_date: NULLABLE_STRING,
    expiry_date: NULLABLE_STRING,
    supplier: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        name: NULLABLE_STRING,
        role: NULLABLE_STRING,
        address: NULLABLE_STRING,
        health_permit: NULLABLE_STRING,
        website: NULLABLE_STRING,
      },
      propertyOrdering: ['name', 'role', 'address', 'health_permit', 'website'],
    },
    package_size_text: NULLABLE_STRING,
    front_claims: { type: 'ARRAY', items: STRING },
    warning_seals: { type: 'ARRAY', items: STRING },
    remarks: NULLABLE_STRING,
  },
  required: ['images', 'nutrition_table', 'ingredients', 'contains_statement', 'may_contain_statement',
    'other_allergen_statements', 'origin', 'storage'],
  propertyOrdering: ['images', 'product_name', 'nutrition_table', 'ingredients', 'contains_statement',
    'may_contain_statement', 'other_allergen_statements', 'origin', 'storage', 'usage_instructions',
    'shelf_life_text', 'production_date', 'expiry_date', 'supplier', 'package_size_text', 'front_claims',
    'warning_seals', 'remarks'],
};
