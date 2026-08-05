import { z } from 'zod';
import { ACTION_SOURCES } from './actions.js';

// v1 wire envelope, exact shape from contracts/semantic-input.md "Wire format". Every transport
// adapter maps its native message to this shape before the input boundary sees anything
// (Principle III) — this schema is boundary rule 1 ("Validation") made executable.

const sourceSchema = z.enum(ACTION_SOURCES);

const positionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

function envelope<Type extends string, Payload extends z.ZodType>(type: Type, payload: Payload) {
  return z.object({
    v: z.literal(1),
    type: z.literal(type),
    payload,
    source: sourceSchema,
    msgId: z.string().min(1).optional(),
    sentAt: z.iso.datetime({ offset: true }),
  });
}

const categorySelectEnvelope = envelope(
  'category.select',
  z.object({ categoryId: z.string().min(1) }).strict(),
);

const previewHoverEnvelope = envelope(
  'preview.hover',
  z.union([
    z.object({ direction: z.enum(['next', 'prev']) }).strict(),
    z.object({ projectId: z.string().min(1) }).strict(),
  ]),
);

const projectSelectEnvelope = envelope('project.select', z.object({}).strict());

const contentSelectEnvelope = envelope(
  'content.select',
  z.object({ position: positionSchema }).strict(),
);

const navBackEnvelope = envelope('nav.back', z.object({}).strict());

const navIdleEnvelope = envelope('nav.idle', z.object({}).strict());

const operatorResetEnvelope = envelope('operator.reset', z.object({}).strict());

const operatorCommandEnvelope = envelope(
  'operator.command',
  z.object({ command: z.string().min(1), params: z.unknown().optional() }).strict(),
);

const connectionStatusEnvelope = envelope(
  'connection.status',
  z.object({ connected: z.boolean(), transportId: z.string().min(1) }).strict(),
);

/** The full v1 semantic-action envelope schema — the executable form of the contract's action set. */
export const semanticEnvelopeV1Schema = z.discriminatedUnion('type', [
  categorySelectEnvelope,
  previewHoverEnvelope,
  projectSelectEnvelope,
  contentSelectEnvelope,
  navBackEnvelope,
  navIdleEnvelope,
  operatorResetEnvelope,
  operatorCommandEnvelope,
  connectionStatusEnvelope,
]);

export type SemanticEnvelopeV1 = z.infer<typeof semanticEnvelopeV1Schema>;

export type SemanticEnvelopeParseResult = z.ZodSafeParseResult<SemanticEnvelopeV1>;

/** Validates an untrusted wire message against the v1 envelope schema (boundary rule 1). */
export function parseSemanticEnvelope(data: unknown): SemanticEnvelopeParseResult {
  return semanticEnvelopeV1Schema.safeParse(data);
}
