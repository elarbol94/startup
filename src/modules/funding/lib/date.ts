import { localDateInZone } from "@/modules/calendar/date-utils";

export const toAustrianIsoDate = (value = new Date()) => localDateInZone(value, "Europe/Vienna");
