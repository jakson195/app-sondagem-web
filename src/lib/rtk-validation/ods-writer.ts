import { strToU8, zipSync } from "fflate";

export type OdsCellValue = string | number | boolean | null | undefined;

export interface OdsSheet {
  name: string;
  rows: OdsCellValue[][];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cellXml(value: OdsCellValue): string {
  if (value == null || value === "") {
    return '<table:table-cell office:value-type="string"><text:p></text:p></table:table-cell>';
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const text = String(value);
    return `<table:table-cell office:value-type="float" office:value="${text}"><text:p>${text}</text:p></table:table-cell>`;
  }
  if (typeof value === "boolean") {
    const text = value ? "TRUE" : "FALSE";
    return `<table:table-cell office:value-type="boolean" office:boolean-value="${text}"><text:p>${text}</text:p></table:table-cell>`;
  }
  const text = escapeXml(String(value));
  return `<table:table-cell office:value-type="string"><text:p>${text}</text:p></table:table-cell>`;
}

function rowXml(cells: OdsCellValue[]): string {
  return `<table:table-row>${cells.map(cellXml).join("")}</table:table-row>`;
}

function tableXml(sheet: OdsSheet): string {
  const safeName = sheet.name.replace(/"/g, "").slice(0, 31) || "Planilha";
  const columnCount = Math.max(1, ...sheet.rows.map((r) => r.length));
  const cols = Array.from({ length: columnCount }, () => '<table:table-column table:default-cell-style-name="Default"/>').join("");
  const rows = sheet.rows.map(rowXml).join("");
  return `<table:table table:name="${escapeXml(safeName)}" table:style-name="ta1">${cols}${rows}</table:table>`;
}

function contentXml(sheets: OdsSheet[]): string {
  const tables = sheets.map(tableXml).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="Default" style:family="table-cell">
      <style:table-cell-properties fo:border="none"/>
    </style:style>
    <style:style style:name="ta1" style:family="table">
      <style:table-properties table:display="true"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:spreadsheet>${tables}</office:spreadsheet>
  </office:body>
</office:document-content>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:font-face-decls>
    <style:font-face style:name="Arial" svg:font-family="Arial" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"/>
  </office:font-face-decls>
  <office:styles>
    <style:default-style style:family="table-cell">
      <style:text-properties style:font-name="Arial"/>
    </style:default-style>
  </office:styles>
</office:document-styles>`;

function metaXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta>
    <meta:generator>DataGeo NTRIP</meta:generator>
    <dc:title>${escapeXml(title)}</dc:title>
  </office:meta>
</office:document-meta>`;
}

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="META-INF/manifest.xml"/>
</manifest:manifest>`;

export function buildOdsBlob(sheets: OdsSheet[], title = "Planilha"): Blob {
  const zipData = zipSync(
    {
      mimetype: [strToU8("application/vnd.oasis.opendocument.spreadsheet"), { level: 0 }],
      "content.xml": strToU8(contentXml(sheets)),
      "styles.xml": strToU8(STYLES_XML),
      "meta.xml": strToU8(metaXml(title)),
      "META-INF/manifest.xml": strToU8(MANIFEST_XML),
    },
    { level: 6 },
  );
  return new Blob([zipData], {
    type: "application/vnd.oasis.opendocument.spreadsheet",
  });
}

export function downloadOdsBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ods") ? filename : `${filename}.ods`;
  a.click();
  URL.revokeObjectURL(url);
}
