import { z } from "zod";
import { isValidDate } from "@/modules/calendar/date-utils";
import {
  contactClosenessLevels,
  contactRelationships,
  contactVisibilities,
  interactionChannels,
  leadKinds,
  leadStatuses,
} from "./constants";
import { MAX_TAG_LENGTH, MAX_TAGS_PER_CONTACT } from "./network-utils";

export const idSchema = z.string().min(1).max(100);
/** A Gemeindekennziffer from the map section, or none. */
export const municipalityCodeSchema = z.string().regex(/^\d{5}$/).nullish().transform((value) => value ?? null);
const text = (max: number) => z.string().trim().max(max).default("");
const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null)
  .refine((value) => value === null || isValidDate(value));
const tagsSchema = z.array(z.string().max(MAX_TAG_LENGTH * 2)).max(MAX_TAGS_PER_CONTACT * 2).default([]);

export const contactSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(160),
  organization: text(160),
  role: text(160),
  relationship: z.enum(contactRelationships).nullish().transform((value) => value ?? null),
  closeness: z.enum(contactClosenessLevels).nullish().transform((value) => value ?? null),
  metContext: text(300),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
  phone: text(60),
  // http(s) only: the value is rendered as a link.
  linkedinUrl: z.union([z.literal(""), z.string().trim().max(500).url().regex(/^https?:\/\//i)]).default(""),
  notes: text(20_000),
  lastContactOn: optionalDate,
  municipalityCode: municipalityCodeSchema,
});
export type ContactInput = z.input<typeof contactSchema>;

export const leadSchema = z.object({
  id: idSchema.optional(),
  contactId: idSchema,
  kind: z.enum(leadKinds).default("info"),
  summary: z.string().trim().min(1).max(1000),
  targetName: text(160),
  targetOrganization: text(160),
  targetContactId: idSchema.nullish().transform((value) => value ?? null),
  status: z.enum(leadStatuses).default("open"),
  nextStep: text(500),
  dueOn: optionalDate,
});
export type LeadInput = z.input<typeof leadSchema>;

/** Quick capture: a name (new or existing contact), what they said, and tags. */
export const quickCaptureSchema = z.object({
  contactId: idSchema.nullish().transform((value) => value ?? null),
  name: z.string().trim().max(160).default(""),
  note: text(1000),
  kind: z.enum(leadKinds).default("info"),
  metContext: text(300),
  tags: tagsSchema,
  /** Also log today's conversation, which sets the last-contact date. */
  metToday: z.boolean().default(false),
  /** Where a new contact lives; ignored when adding to an existing contact. */
  municipalityCode: municipalityCodeSchema,
}).refine((value) => value.contactId || value.name, { path: ["name"] });
export type QuickCaptureInput = z.input<typeof quickCaptureSchema>;

export const contactTagsSchema = z.object({ contactId: idSchema, tags: tagsSchema });
export const visibilitySchema = z.object({ contactId: idSchema, visibility: z.enum(contactVisibilities) });
export const leadStatusSchema = z.object({ id: idSchema, status: z.enum(leadStatuses) });

export const interactionSchema = z.object({
  contactId: idSchema,
  occurredOn: z.string().trim().refine(isValidDate),
  channel: z.enum(interactionChannels).default("meeting"),
  note: text(1000),
});
export type InteractionInput = z.input<typeof interactionSchema>;
/** Editing a touchpoint: the contact is fixed, so it is not part of the input. */
export const interactionUpdateSchema = interactionSchema.omit({ contactId: true }).extend({ id: idSchema });
export type InteractionUpdateInput = z.input<typeof interactionUpdateSchema>;

export const leadTaskLinkSchema = z.object({ leadId: idSchema, taskId: idSchema });
