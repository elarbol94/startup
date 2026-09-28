import type { OfficeConfig } from "./config";
import { signFileToken, signJwt } from "./tokens";

export const OFFICE_PLUGIN_GUID = "asc.{5B2E0C7A-4F61-4B8E-9C3D-7A1E2F90B6D4}";
export const OFFICE_PLUGIN_PATH = "/onlyoffice-plugins/management";

export type PluginOptions = {
  pageId: string;
  /** PDF annotation to insert once the document is open. */
  insertEvidenceId?: string;
  /** Task or deadline control to select once the document is open. */
  focusTaskId?: string;
  focusDeadlineId?: string;
};

export type EditorConfigInput = {
  config: OfficeConfig;
  page: { id: string; title: string };
  user: { id: string; name: string };
  locale: "de" | "en";
  sessionKey: string;
  head: { id: string; attachmentId: string };
  /** Browser-facing app origin, used for the plugin URL. */
  origin: string;
  canEdit: boolean;
  plugin: PluginOptions;
};

/**
 * Builds the signed DocsAPI configuration. The document URL and callback use
 * the internal network; the plugin loads from the app origin in the browser.
 */
export function buildEditorConfig(input: EditorConfigInput) {
  const { config, page, head } = input;
  const fileToken = signFileToken({ res: "docx", pageId: page.id, versionId: head.id, attachmentId: head.attachmentId });
  const pending = Boolean(input.plugin.insertEvidenceId || input.plugin.focusTaskId || input.plugin.focusDeadlineId);
  const editorConfig = {
    document: {
      fileType: "docx",
      key: input.sessionKey,
      title: `${page.title}.docx`,
      url: `${config.appInternalUrl}/api/wiki/office/file?token=${encodeURIComponent(fileToken)}`,
      permissions: {
        edit: input.canEdit,
        comment: true,
        review: input.canEdit,
        download: true,
        print: true,
        chat: false,
      },
    },
    documentType: "word",
    editorConfig: {
      mode: input.canEdit ? "edit" : "view",
      callbackUrl: `${config.appInternalUrl}/api/wiki/office/callback?page=${encodeURIComponent(page.id)}`,
      lang: input.locale,
      region: input.locale === "de" ? "de-AT" : "en-US",
      user: { id: input.user.id, name: input.user.name },
      customization: {
        autosave: true,
        forcesave: true,
        macros: false,
        plugins: true,
        compactHeader: true,
        toolbarNoTabs: false,
        // More room for the page; the paragraph panel stays one click away.
        hideRightMenu: true,
        features: { featuresTips: false },
        feedback: false,
        help: false,
        goback: false,
        uiTheme: "theme-light",
        unit: "cm",
      },
      plugins: {
        autostart: pending ? [OFFICE_PLUGIN_GUID] : [],
        pluginsData: [`${input.origin}${OFFICE_PLUGIN_PATH}/config.json`],
        options: { all: input.plugin },
      },
    },
  };
  return { ...editorConfig, token: signJwt(editorConfig, config.inboxSecret) };
}

export type EditorConfig = ReturnType<typeof buildEditorConfig>;
