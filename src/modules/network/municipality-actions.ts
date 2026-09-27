"use server";

import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth";
import { searchMunicipalityOptions, type MunicipalityOption } from "./municipalities.server";
import {
  countNetworkContactsByMunicipality,
  getMunicipalityNetwork as loadMunicipalityNetwork,
  type MunicipalityContactCount,
  type MunicipalityNetwork,
} from "./municipality-queries";

export async function searchNetworkMunicipalities(query: string): Promise<MunicipalityOption[]> {
  await requireUserOrThrow();
  return searchMunicipalityOptions(z.string().max(100).catch("").parse(query));
}

/** For the municipality section's detail panel. */
export async function getMunicipalityNetwork(municipalityCode: string): Promise<MunicipalityNetwork> {
  const viewer = await requireUserOrThrow();
  const code = z.string().regex(/^\d{5}$/).safeParse(municipalityCode);
  if (!code.success) return { residents: [], organizations: [] };
  return loadMunicipalityNetwork(viewer, code.data);
}

/** For the map overlay in the municipality section. */
export async function getNetworkMapCounts(): Promise<MunicipalityContactCount[]> {
  const viewer = await requireUserOrThrow();
  return countNetworkContactsByMunicipality(viewer);
}
