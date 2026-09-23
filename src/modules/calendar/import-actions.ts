"use server";

import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth";
import { fetchPublicText } from "@/lib/public-fetch";
import { analyzeCalendarImportWithAi } from "./calendar-ai";
import {
  mergeCalendarImportSuggestions,
  normalizeCalendarUrl,
  parseCalendarImport,
  type CalendarImportSuggestion,
} from "./import-parser";

const MAX_TEXT_LENGTH = 250_000;
const MAX_URL_BYTES = 1_500_000;

const timezoneSchema = z.string().trim().min(1).max(120).refine((timezone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
});

function safetyIdentifier(userId: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret
    ? createHmac("sha256", secret).update(userId).digest("hex")
    : createHash("sha256").update(userId).digest("hex");
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractHtml(html: string) {
  const jsonLd: unknown[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      jsonLd.push(JSON.parse(match[1]));
    } catch {
      // Ignore malformed metadata and continue with the visible page.
    }
  }
  const metaTitle =
    html.match(
      /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*>/i,
    )?.[1] ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/(?:p|div|li|h[1-6]|dt|dd|section|article|tr|td)>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: text.slice(0, MAX_TEXT_LENGTH),
    title: metaTitle ? decodeHtml(metaTitle).trim() : undefined,
    jsonLd,
  };
}

export async function analyzeCalendarText(input: {
  text: string;
  fileName?: string;
  timezone: string;
}): Promise<CalendarImportSuggestion> {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      text: z.string().min(1).max(MAX_TEXT_LENGTH),
      fileName: z.string().max(240).optional(),
      timezone: timezoneSchema,
    })
    .parse(input);
  const parserSuggestion = parseCalendarImport(data.text, {
    targetTimezone: data.timezone,
  });
  if (/BEGIN:VEVENT/i.test(data.text)) {
    return { ...parserSuggestion, analysisMethod: "parser" };
  }
  const aiSuggestion = await analyzeCalendarImportWithAi({
    text: data.text,
    timezone: data.timezone,
    safetyIdentifier: safetyIdentifier(currentUser.id),
  });
  const primarySuggestion =
    aiSuggestion && Object.keys(aiSuggestion).length > 0 ? aiSuggestion : null;
  return {
    ...mergeCalendarImportSuggestions(primarySuggestion ?? {}, parserSuggestion),
    analysisMethod: primarySuggestion ? "ai" : "parser",
  };
}

export async function analyzeCalendarUrl(input: {
  url: string;
  timezone: string;
}): Promise<CalendarImportSuggestion> {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      url: z.string().trim().min(1).max(2_000),
      timezone: timezoneSchema,
    })
    .parse(input);
  const result = await fetchPublicText(normalizeCalendarUrl(data.url), {
    maxBytes: MAX_URL_BYTES,
    redirects: 3,
    headers: {
      Accept: "text/html,text/calendar,text/plain;q=0.9,*/*;q=0.2",
      "User-Agent": "management-platform-calendar-import/1.0",
    },
  });
  if (/text\/calendar/i.test(result.contentType) || /BEGIN:VEVENT/i.test(result.body)) {
    return {
      ...parseCalendarImport(result.body, {
        sourceUrl: result.finalUrl,
        targetTimezone: data.timezone,
      }),
      analysisMethod: "parser",
    };
  }
  const html = extractHtml(result.body);
  const parserSuggestion = parseCalendarImport(html.text, {
    titleHint: html.title,
    jsonLd: html.jsonLd,
    sourceUrl: result.finalUrl,
    targetTimezone: data.timezone,
  });
  const aiSuggestion = await analyzeCalendarImportWithAi({
    text: html.text,
    title: html.title,
    metadata: html.jsonLd,
    timezone: data.timezone,
    safetyIdentifier: safetyIdentifier(currentUser.id),
  });
  const primarySuggestion =
    aiSuggestion && Object.keys(aiSuggestion).length > 0 ? aiSuggestion : null;
  return {
    ...mergeCalendarImportSuggestions(primarySuggestion ?? {}, parserSuggestion),
    analysisMethod: primarySuggestion ? "ai" : "parser",
  };
}
