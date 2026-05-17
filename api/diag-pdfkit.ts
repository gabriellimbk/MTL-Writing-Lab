import PDFDocument from "pdfkit";

export default function handler(_req: any, res: any) {
  res.status(200).json({
    status: "ok",
    dependency: "pdfkit",
    type: typeof PDFDocument,
  });
}
