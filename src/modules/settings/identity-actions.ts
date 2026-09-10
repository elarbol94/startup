"use server";

import { requireUserOrThrow } from "@/lib/auth";
import { listUserIdentities } from "./queries";

export async function getUserIdentities() {
  await requireUserOrThrow();
  return listUserIdentities();
}
