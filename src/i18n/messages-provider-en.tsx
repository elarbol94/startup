"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { timeZone } from "./config";

export function EnMessagesProvider({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="en" timeZone={timeZone} messages={messages}>{children}</NextIntlClientProvider>;
}
