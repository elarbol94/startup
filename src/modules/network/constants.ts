// Plain constants shared by the schema and client components (no DB imports).
export const contactVisibilities = ["private", "team"] as const;
export type ContactVisibility = (typeof contactVisibilities)[number];

export const contactRelationships = ["friend", "acquaintance", "professional", "event"] as const;
export type ContactRelationship = (typeof contactRelationships)[number];

export const contactClosenessLevels = ["close", "known", "loose"] as const;
export type ContactCloseness = (typeof contactClosenessLevels)[number];

/** What a contact could do for us: introduce someone, help, advise, work with us, or know something. */
export const leadKinds = ["intro", "help", "advice", "collaboration", "info"] as const;
export type LeadKind = (typeof leadKinds)[number];

export const leadStatuses = ["open", "asked", "done", "dropped"] as const;
export type LeadStatus = (typeof leadStatuses)[number];

/** Leads that still need something from us; shown on the opportunities list. */
export const activeLeadStatuses = ["open", "asked"] as const satisfies readonly LeadStatus[];

/** How we were in touch; logged on the contact's history. */
export const interactionChannels = ["meeting", "call", "message", "email", "event", "other"] as const;
export type InteractionChannel = (typeof interactionChannels)[number];
