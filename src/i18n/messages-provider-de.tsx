"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/de.json";
import { timeZone } from "./config";

export function DeMessagesProvider({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="de" timeZone={timeZone} messages={messages}>{children}</NextIntlClientProvider>;
}
