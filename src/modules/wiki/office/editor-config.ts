import type { OfficeConfig } from "./config";
import { signFileToken, signJwt, signScratchToken } from "./tokens";

export const OFFICE_PLUGIN_GUID = "asc.{5B2E0C7A-4F61-4B8E-9C3D-7A1E2F90B6D4}";
export const OFFICE_PLUGIN_PATH = "/onlyoffice-plugins/management";

export type PluginOptions = {
  pageId: string;
  /** BroadcastChannel name suffix shared by this editor instance and its page. */
  bridgeId: string;
  /** The signed-in user (section-edit locks name their owner). */
  userId?: string;
  userName?: string;
  /** "section": the section editor's scratch document (no bibliography, styles or section menu). */
  mode?: "section";
  /** PDF annotation to insert once the document is open. */
  insertEvidenceId?: string;
  /** Task or deadline control to select once the document is open. */
  focusTaskId?: string;
  focusDeadlineId?: string;
};

type BaseInput = {
  config: OfficeConfig;
  page: { id: string; title: string };
  user: { id: string; name: string };
  locale: "de" | "en";
  theme: "light" | "dark";
  /** Browser-facing app origin, used for the plugin URL. */
  origin: string;
  plugin: PluginOptions;
};

export type EditorConfigInput = BaseInput & {
  sessionKey: string;
  head: { id: string; attachmentId: string };
  canEdit: boolean;
  /** DocsAPI actionLink from a mention notification: opens at that comment. */
  actionLink?: Record<string, unknown>;
};

/** Browser-facing origin: nginx forwards the public host and scheme. */
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

function signedConfig(input: BaseInput, options: {
  document: { key: string; url: string; title: string };
  callbackUrl: string;
  canEdit: boolean;
  review: boolean;
  forcesave: boolean;
  actionLink?: Record<string, unknown>;
}) {
  const editorConfig = {
    document: {
      fileType: "docx",
      key: options.document.key,
      title: options.document.title,
      url: options.document.url,
      permissions: {
        edit: options.canEdit,
        comment: true,
        review: options.review,
        download: true,
        print: true,
        chat: false,
      },
    },
    documentType: "word",
    editorConfig: {
      mode: options.canEdit ? "edit" : "view",
      callbackUrl: options.callbackUrl,
      lang: input.locale,
      region: input.locale === "de" ? "de-AT" : "en-US",
      user: { id: input.user.id, name: input.user.name },
      ...(options.actionLink ? { actionLink: options.actionLink } : {}),
      customization: {
        autosave: true,
        forcesave: options.forcesave,
        macros: false,
        plugins: true,
        compactHeader: true,
        // Follows the app's light/dark appearance.
        uiTheme: input.theme === "dark" ? "theme-dark" : "theme-light",
        features: { featuresTips: false, spellcheck: { mode: true } },
        // More room for the page; the paragraph panel stays one click away.
        hideRightMenu: true,
        feedback: false,
        help: false,
        goback: false,
        unit: "cm",
      },
      plugins: {
        // The workspace plugin always runs: it adds the "Workspace" toolbar tab.
        autostart: [OFFICE_PLUGIN_GUID],
        pluginsData: [`${input.origin}${OFFICE_PLUGIN_PATH}/config.json`],
        options: { all: input.plugin },
      },
    },
  };
  return { ...editorConfig, token: signJwt(editorConfig, input.config.inboxSecret) };
}

/**
 * Builds the signed DocsAPI configuration. The document URL and callback use
 * the internal network; the plugin loads from the app origin.
 * Logo and `layout` customization need a commercial licence (the Community
 * edition ignores them); the page hides unused toolbar tabs itself.
 */
export function buildEditorConfig(input: EditorConfigInput) {
  const { config, page, head } = input;
  const fileToken = signFileToken({ res: "docx", pageId: page.id, versionId: head.id, attachmentId: head.attachmentId });
  return signedConfig(input, {
    document: { key: input.sessionKey, title: `${page.title}.docx`, url: `${config.appInternalUrl}/api/wiki/office/file?token=${encodeURIComponent(fileToken)}` },
    callbackUrl: `${config.appInternalUrl}/api/wiki/office/callback?page=${encodeURIComponent(page.id)}`,
    canEdit: input.canEdit,
    review: input.canEdit,
    forcesave: true,
    actionLink: input.actionLink,
  });
}

/**
 * Config for the section editor's scratch document (scratch.ts): a blank DOCX
 * served from memory, callbacks discarded, no track changes.
 */
export function buildScratchEditorConfig(input: BaseInput & { scratchKey: string }) {
  const { config, page, locale } = input;
  const token = signScratchToken({ key: input.scratchKey, locale });
  return signedConfig(input, {
    document: { key: input.scratchKey, title: `${page.title}.docx`, url: `${config.appInternalUrl}/api/wiki/office/scratch?token=${encodeURIComponent(token)}` },
    callbackUrl: `${config.appInternalUrl}/api/wiki/office/callback?scratch=1`,
    canEdit: true,
    review: false,
    forcesave: false,
  });
}

export type EditorConfig = ReturnType<typeof buildEditorConfig>;
