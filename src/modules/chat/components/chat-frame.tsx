import { ELEMENT_WEB_URL } from "@/modules/chat/constants";

/**
 * Full-bleed Element Web. The app layout drops the workspace padding around
 * `[data-chat-root]`, so the client fills the whole content area.
 */
export function ChatFrame({ title }: { title: string }) {
  return (
    <div data-chat-root className="h-full min-h-0 w-full">
      <iframe
        src={ELEMENT_WEB_URL}
        title={title}
        className="block h-full w-full border-0"
        allow="camera; microphone; display-capture; clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
