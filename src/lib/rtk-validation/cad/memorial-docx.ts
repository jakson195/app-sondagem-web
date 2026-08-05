import {
  AlignmentType,
  convertMillimetersToTwip,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  buildMemorialNarrative,
  computePolygonMetrics,
  formatAreaBr,
  vertexLabelsPn,
} from "./polygon-utils";
import type { MemorialDocInput } from "./memorial-types";
import { memorialKindTitle, memorialSectionTitle } from "./memorial-types";

export type { MemorialDocInput } from "./memorial-types";

const ARIAL = "Arial";

function arialRun(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    font: ARIAL,
    bold: opts.bold,
    italics: opts.italics,
    size: opts.size ?? 22,
  });
}

function centeredParagraph(children: TextRun[], lineSpacing = 480) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: lineSpacing, before: 0, after: 0 },
    children,
  });
}

function bodyParagraph(children: TextRun[], align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.JUSTIFIED) {
  return new Paragraph({
    alignment: align,
    spacing: { after: 120 },
    children,
  });
}

function blankLines(count: number) {
  return Array.from({ length: count }, () => new Paragraph({ text: "" }));
}

export async function generateMemorialDocx(input: MemorialDocInput): Promise<Blob> {
  const labels = input.vertexLabels ?? vertexLabelsPn(input.vertices.length);
  const metrics = computePolygonMetrics(input.vertices, true, labels);
  const narrative = buildMemorialNarrative({
    vertices: input.vertices,
    vertexLabels: labels,
    crsLabel: input.crsLabel,
    projectionNote: input.projectionNote,
    appNote: input.appNote,
  });

  const kindTitle = memorialKindTitle(input.memorialKind, input.memorialKindCustom);
  const sectionTitle = memorialSectionTitle(input.memorialKind);
  const municipalityState = `${input.municipality || "—"}/${input.state || "—"}`;

  const narrativeRuns = narrative.map((part) => arialRun(part.text, { bold: part.bold }));

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(30),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(30),
            },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { line: 480, after: 120 },
            children: [
              arialRun(`MEMORIAL DESCRITIVO de ${kindTitle}`, { bold: true }),
            ],
          }),
          centeredParagraph([arialRun(input.registration || "—", { bold: true })]),
          bodyParagraph([
            arialRun("ÁREA", { bold: true }),
            arialRun(`: ${formatAreaBr(metrics.areaM2)}`),
          ]),
          bodyParagraph([
            arialRun("MUNICÍPIO / EST", { bold: true }),
            arialRun(`: ${municipalityState}`),
          ]),
          new Paragraph({ text: "" }),
          centeredParagraph([arialRun(sectionTitle, { bold: true })]),
          new Paragraph({ text: "" }),
          bodyParagraph(narrativeRuns),
          ...blankLines(2),
          bodyParagraph([arialRun("Proprietário:")]),
          ...(input.owner
            ? [centeredParagraph([arialRun(input.owner, { bold: true })])]
            : []),
          ...blankLines(input.owner ? 2 : 3),
          centeredParagraph([arialRun("_".repeat(66))]),
          centeredParagraph([arialRun(input.lawFirmName, { bold: true })]),
          centeredParagraph([arialRun(`CNPJ Nº ${input.lawFirmCnpj}`)]),
          ...blankLines(3),
          bodyParagraph([arialRun("Responsável Técnico:", { bold: true })]),
          ...blankLines(3),
          centeredParagraph([arialRun("_".repeat(49))]),
          centeredParagraph([arialRun(input.technicalName, { bold: true })]),
          centeredParagraph([arialRun(input.technicalCrea)]),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
