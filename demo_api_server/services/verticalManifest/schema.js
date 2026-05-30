const { z } = require('zod');

const ChipSchema = z.object({
  id: z.string(),
  label: z.string(),
  message: z.string(),
  group: z.string().optional(),
  scope: z.string().optional(),
});

const FormatEnum = z.enum(['money', 'count', 'date', 'text', 'percent']);

const RenderFieldSchema = z.object({
  label: z.string(),
  path: z.string(),
  format: FormatEnum.optional(),
  accent: z.boolean().optional(),
});

const RenderDescriptorSchema = z.object({
  type: z.enum(['card', 'fieldList', 'table', 'text']),
  title: z.string().optional(),
  fields: z.array(RenderFieldSchema).optional(),
  columns: z.array(z.object({
    label: z.string(),
    path: z.string(),
    format: FormatEnum.optional(),
  })).optional(),
});

const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  schemaVersion: z.literal(3),

  identity: z.object({
    displayName: z.string().min(1),
    headerTitle: z.string().optional(),
    documentTitle: z.string().optional(),
    logoAlt: z.string().optional(),
    tagline: z.string().optional(),
    logoPath: z.string().optional(),
    // Optional react-icons/md name (e.g. "MdLocalHospital") for the header brand
    // icon. Falls back to the default bank icon in the UI when absent/unknown.
    icon: z.string().optional(),
  }),

  theme: z.object({
    cssVars: z.record(z.string(), z.string())
      .refine((v) => Object.keys(v).length > 0, { message: 'at least one cssVar required' }),
  }),

  terminology: z.object({
    account: z.string().optional(),
    accounts: z.string().optional(),
    accountTypes: z.array(z.string()).optional(),
    transaction: z.string().optional(),
    transactions: z.string().optional(),
    transactionTypes: z.array(z.string()).optional(),
    balance: z.string().optional(),
    agent: z.string().optional(),
    dashboard: z.string().optional(),
    highValueAction: z.string().optional(),
    highValueLabel: z.string().optional(),
  }).optional(),

  agent: z.object({
    persona: z.string().min(1),
    greeting: z.string().optional(),
    systemPromptFlavor: z.string().optional(),
  }),

  dashboard: z.object({
    kind: z.string(),
    chips: z.array(z.object({ key: z.string(), label: z.string() })),
    hero: z.object({
      cards: z.array(z.object({
        label: z.string(),
        dataKey: z.string(),
        format: FormatEnum,
      })),
    }).optional(),
    llmChipGroups: z.record(z.string(), z.array(ChipSchema)).optional(),
  }).optional(),

  scopes: z.object({
    read: z.string().default('read'),
    write: z.string().default('write'),
    transfer: z.string().default('transfer'),
    featureScope: z.string().optional(),
  }).optional().default({}),

  featurePage: z.object({
    mcpTool: z.string(),
    pageTitle: z.string(),
    badgeLabel: z.string().optional(),
    accentColor: z.string().optional(),
    dataKey: z.string(),
    fields: z.array(z.object({
      label: z.string(),
      path: z.string(),
      format: FormatEnum.optional(),
      accent: z.boolean().optional(),
    })),
    sectionTitle: z.string().optional(),
    emptyPrompt: z.string().optional(),
    scopeError: z.string().optional(),
  }).optional(),

  render: z.record(z.string(), RenderDescriptorSchema).optional(),

  demoUsers: z.object({
    customer: z.object({ hint: z.string(), passwordHint: z.string() }).optional(),
    admin: z.object({ hint: z.string(), passwordHint: z.string() }).optional(),
  }).optional(),
});

const MockDataSchema = z.record(z.string(), z.unknown());

module.exports = { ManifestSchema, MockDataSchema, ChipSchema, FormatEnum };
