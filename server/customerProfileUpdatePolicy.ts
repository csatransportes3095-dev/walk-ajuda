import { z } from "zod";
import { getSetting, upsertSetting } from "./db";
import {
  CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS,
  getEffectiveCustomerProfileUpdateFields,
  normalizeCustomerProfileUpdateFields,
  customerProfileFieldIsMissing,
  type CustomerProfileUpdateField,
} from "@shared/customerProfileUpdate";

const POLICY_PREFIX = "customer_profile_update_policy:";
const COMPLETION_PREFIX = "customer_profile_update_completion:";
const PHOTO_SUBMISSION_PREFIX = "customer_profile_update_photo_submission:";

const policySchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  fields: z.array(z.enum(CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS.map((field) => field.id) as [CustomerProfileUpdateField, ...CustomerProfileUpdateField[]])),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().trim().max(128).optional(),
});

export type CustomerProfileUpdatePolicy = z.infer<typeof policySchema>;

const completionSchema = z.object({
  revision: z.number().int().positive(),
  completedAt: z.string().datetime(),
});

const photoSubmissionSchema = z.object({
  revision: z.number().int().positive(),
  submittedAt: z.string().datetime(),
});

export type CustomerProfileUpdateState = {
  enabled: boolean;
  configuredFields: CustomerProfileUpdateField[];
  effectiveFields: CustomerProfileUpdateField[];
  missingFields: CustomerProfileUpdateField[];
  pending: boolean;
  revision: number;
  updatedAt: string | null;
  updatedBy?: string;
};

function policyKey(customerId: number): string {
  return `${POLICY_PREFIX}${Math.trunc(customerId)}`;
}

function completionKey(customerId: number): string {
  return `${COMPLETION_PREFIX}${Math.trunc(customerId)}`;
}

function photoSubmissionKey(customerId: number): string {
  return `${PHOTO_SUBMISSION_PREFIX}${Math.trunc(customerId)}`;
}

function defaultPolicy(): CustomerProfileUpdatePolicy {
  return {
    version: 1,
    enabled: false,
    fields: [],
    revision: 1,
    updatedAt: new Date(0).toISOString(),
  };
}

export async function getCustomerProfileUpdatePolicy(customerId: number): Promise<CustomerProfileUpdatePolicy> {
  const raw = await getSetting(policyKey(customerId));
  if (!raw) return defaultPolicy();
  try {
    const parsed = JSON.parse(raw);
    const result = policySchema.safeParse(parsed);
    if (!result.success) return defaultPolicy();
    return {
      ...result.data,
      fields: normalizeCustomerProfileUpdateFields(result.data.fields),
    };
  } catch {
    return defaultPolicy();
  }
}

export async function saveCustomerProfileUpdatePolicy(input: {
  customerId: number;
  enabled: boolean;
  fields: unknown;
  updatedBy?: string;
}): Promise<CustomerProfileUpdatePolicy> {
  const customerId = Math.trunc(input.customerId);
  const current = await getCustomerProfileUpdatePolicy(customerId);
  const fields = normalizeCustomerProfileUpdateFields(input.fields);
  if (input.enabled && fields.length === 0) {
    throw new Error("Selecione pelo menos um campo para ativar a atualização obrigatória.");
  }
  const next: CustomerProfileUpdatePolicy = {
    version: 1,
    enabled: input.enabled,
    fields,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    ...(input.updatedBy ? { updatedBy: input.updatedBy.slice(0, 128) } : {}),
  };
  await upsertSetting(policyKey(customerId), JSON.stringify(next));
  return next;
}

async function closeCompletedPolicy(customerId: number, policy: CustomerProfileUpdatePolicy, completedRevision: number): Promise<CustomerProfileUpdatePolicy> {
  if (!policy.enabled || completedRevision < policy.revision) return policy;
  const completedPolicy: CustomerProfileUpdatePolicy = {
    ...policy,
    enabled: false,
    updatedAt: new Date().toISOString(),
  };
  await upsertSetting(policyKey(customerId), JSON.stringify(completedPolicy));
  return completedPolicy;
}

export async function markCustomerProfileUpdateCompleted(customerId: number, revision: number): Promise<void> {
  const normalizedCustomerId = Math.trunc(customerId);
  const completedRevision = Math.max(1, Math.trunc(revision));
  const payload = completionSchema.parse({ revision: completedRevision, completedAt: new Date().toISOString() });
  await upsertSetting(completionKey(normalizedCustomerId), JSON.stringify(payload));

  // A exigência individual é de uso único: ao concluir a revisão atual ela deve
  // ficar inativa. A revisão não é incrementada aqui, evitando criar outra
  // pendência imediatamente após o cliente finalizar o cadastro.
  const current = await getCustomerProfileUpdatePolicy(normalizedCustomerId);
  await closeCompletedPolicy(normalizedCustomerId, current, completedRevision);
}

export async function markCustomerProfilePhotoSubmitted(customerId: number, revision: number): Promise<void> {
  const payload = photoSubmissionSchema.parse({ revision: Math.max(1, Math.trunc(revision)), submittedAt: new Date().toISOString() });
  await upsertSetting(photoSubmissionKey(Math.trunc(customerId)), JSON.stringify(payload));
}

async function getCompletionRevision(customerId: number): Promise<number> {
  const raw = await getSetting(completionKey(Math.trunc(customerId)));
  if (!raw) return 0;
  try {
    const parsed = completionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.revision : 0;
  } catch {
    return 0;
  }
}

async function getPhotoSubmissionRevision(customerId: number): Promise<number> {
  const raw = await getSetting(photoSubmissionKey(Math.trunc(customerId)));
  if (!raw) return 0;
  try {
    const parsed = photoSubmissionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.revision : 0;
  } catch {
    return 0;
  }
}

export async function hasCustomerProfilePhotoSubmission(customerId: number, revision: number): Promise<boolean> {
  return (await getPhotoSubmissionRevision(customerId)) >= Math.max(1, Math.trunc(revision));
}

export function evaluateCustomerProfileUpdateState(
  customer: any,
  policy: Pick<CustomerProfileUpdatePolicy, "enabled" | "fields" | "revision" | "updatedAt" | "updatedBy">,
  completedRevision = 0,
): CustomerProfileUpdateState {
  const effectiveFields = getEffectiveCustomerProfileUpdateFields(customer, policy.fields, policy.enabled);
  const missingFields = effectiveFields.filter((field) => customerProfileFieldIsMissing(customer, field));
  return {
    enabled: policy.enabled,
    configuredFields: normalizeCustomerProfileUpdateFields(policy.fields),
    effectiveFields,
    missingFields,
    // Regra única: só existe atualização quando há campo obrigatório realmente ausente ou inválido.
    pending: missingFields.length > 0,
    revision: policy.revision,
    updatedAt: policy.updatedAt === new Date(0).toISOString() ? null : policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}

export async function getCustomerProfileUpdateState(customer: any): Promise<CustomerProfileUpdateState> {
  const customerId = Number(customer?.id) || 0;
  let policy = await getCustomerProfileUpdatePolicy(customerId);
  const completedRevision = await getCompletionRevision(customerId);

  // Repara automaticamente registros antigos em que a revisão já foi concluída,
  // mas a flag enabled permaneceu gravada como true. Isso elimina o estado
  // "ATIVA + sem pendência" sem exigir correção manual cliente por cliente.
  policy = await closeCompletedPolicy(customerId, policy, completedRevision);
  return evaluateCustomerProfileUpdateState(customer, policy, completedRevision);
}

export function customerProfileUpdatePolicyKey(customerId: number): string {
  return policyKey(customerId);
}
