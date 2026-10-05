"use strict";
// Dependency-free OOXML writer, adapted from the supplied VL2 export.
function xml(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
}
function colName(index) {
  let name = "";
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
const EXCEL_GROUPS = [
  "identity",
  "observing",
  "classifying",
  "designing",
  "conducting",
  "inferring",
  "communicating",
  "knowledge",
  "score",
  "reference",
];
const EXCEL_FILLS = [
  "EEF1F4",
  "E7F0FC",
  "EEE8FA",
  "FFF4D9",
  "E7F3E8",
  "FCEBDD",
  "E1F3F6",
  "FBE7EF",
  "E5ECEF",
  "F6F8F7",
];
const excelCell = (value, group = "identity", mark = null) => ({
  value,
  group,
  mark,
});
const excelFormula = (formula, group = "score") => ({
  value: "",
  formula,
  group,
});
function excelStyle(group, variant = 0) {
  return 1 + Math.max(0, EXCEL_GROUPS.indexOf(group)) * 5 + variant;
}
function excelStylesXML() {
  const colours = ["173E34", "00834A", "C03030", "A46900", "FFFFFF"];
  const fonts = colours
    .map(
      (colour, i) =>
        `<font><sz val="11"/><color rgb="FF${colour}"/><name val="Calibri"/>${i === 4 ? "<b/>" : ""}</font>`,
    )
    .join("");
  const fills =
    '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    EXCEL_FILLS.map(
      (colour) =>
        `<fill><patternFill patternType="solid"><fgColor rgb="FF${colour}"/><bgColor indexed="64"/></patternFill></fill>`,
    ).join("") +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF087B78"/><bgColor indexed="64"/></patternFill></fill>';
  const xfs =
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    EXCEL_GROUPS.map((_, g) =>
      [0, 1, 2, 3, 4]
        .map(
          (v) =>
            `<xf numFmtId="0" fontId="${v}" fillId="${v === 4 ? 12 : g + 2}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`,
        )
        .join(""),
    ).join("");
  return `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5">${fonts}</fonts><fills count="13">${fills}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="51">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="3">${[1, 2, 3].map((i) => `<dxf><font><color rgb="FF${colours[i]}"/></font></dxf>`).join("")}</dxfs></styleSheet>`;
}
function excelDisplayText(value) {
  const text = String(value);
  if (text.length <= 32767) return text;
  let preview = text.slice(0, 30000);
  if (/[\uD800-\uDBFF]$/.test(preview)) preview = preview.slice(0, -1);
  return (
    preview + "\n（內容較長，完整原文見「原始與遞交快照」的本機完整紀錄。）"
  );
}
function sheetXML(sheet) {
  const rows = sheet.rows;
  const cells = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((raw, c) => {
            const cell = raw && typeof raw === "object" ? raw : excelCell(raw),
              value = cell.value ?? "";
            const variant =
              r === 0
                ? 4
                : cell.mark === true
                  ? 1
                  : cell.mark === false
                    ? 2
                    : cell.mark === "partial"
                      ? 3
                      : 0;
            const attrs = `r="${colName(c)}${r + 1}" s="${excelStyle(cell.group, variant)}"`;
            if (cell.formula)
              return `<c ${attrs}><f>${xml(cell.formula)}</f></c>`;
            if (typeof value === "number" && Number.isFinite(value))
              return `<c ${attrs}><v>${value}</v></c>`;
            return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(excelDisplayText(value))}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const validation = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map((v) => `<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="分數超出範圍" error="請輸入 0 至 ${v.max} 的整數。" sqref="${v.range}"><formula1>0</formula1><formula2>${v.max}</formula2></dataValidation>`).join("")}</dataValidations>`
    : "";
  const conditional = (sheet.conditional || [])
    .map(
      (rule, i) =>
        `<conditionalFormatting sqref="${rule.cell}">${[0, 1, 2].map((v) => `<cfRule type="expression" dxfId="${v}" priority="${i * 3 + v + 1}"><formula>${xml(rule.formulas[v])}</formula></cfRule>`).join("")}</conditionalFormatting>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${rows[0].length}" width="24" customWidth="1"/></cols><sheetData>${cells}</sheetData>${rows.length > 1 ? `<autoFilter ref="A1:${colName(rows[0].length - 1)}${rows.length}"/>` : ""}${conditional}${validation}</worksheet>`;
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const encoder = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const u16 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255]);
  const u32 = (v) =>
    new Uint8Array([
      v & 255,
      (v >>> 8) & 255,
      (v >>> 16) & 255,
      (v >>> 24) & 255,
    ]);
  const join = (arrays) => {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let pos = 0;
    for (const a of arrays) {
      out.set(a, pos);
      pos += a.length;
    }
    return out;
  };
  for (const [name, content] of Object.entries(files)) {
    const nb = encoder.encode(name),
      bytes = typeof content === "string" ? encoder.encode(content) : content,
      crc = crc32(bytes);
    const local = join([
      u32(0x04034b50),
      u16(20),
      u16(0x800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(bytes.length),
      u32(bytes.length),
      u16(nb.length),
      u16(0),
      nb,
      bytes,
    ]);
    parts.push(local);
    central.push(
      join([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(bytes.length),
        u32(bytes.length),
        u16(nb.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nb,
      ]),
    );
    offset += local.length;
  }
  const directory = join(central),
    end = join([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(central.length),
      u16(central.length),
      u32(directory.length),
      u32(offset),
      u16(0),
    ]);
  return new Blob([...parts, directory, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
function workbook(sheets, images = []) {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  };
  files["xl/styles.xml"] = excelStylesXML();
  sheets.forEach(
    (s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXML(s)),
  );
  if (images.length) {
    files["[Content_Types].xml"] = files["[Content_Types].xml"].replace(
      "</Types>",
      '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
    );
    const last = sheets.length;
    files[`xl/worksheets/sheet${last}.xml`] = files[
      `xl/worksheets/sheet${last}.xml`
    ]
      .replace(
        "</worksheet>",
        '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></worksheet>',
      )
      .replace(/<row r="(\d+)"/g, (match, row) =>
        +row > 1 ? match + ' ht="130" customHeight="1"' : match,
      );
    files[`xl/worksheets/_rels/sheet${last}.xml.rels`] =
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
    files["xl/drawings/drawing1.xml"] =
      `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${images.map((item, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>4</xdr:col><xdr:colOff>50000</xdr:colOff><xdr:row>${item.row}</xdr:row><xdr:rowOff>50000</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${item.row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="裝置設計圖 ${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`).join("")}</xdr:wsDr>`;
    files["xl/drawings/_rels/drawing1.xml.rels"] =
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${images.map((item, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/setup-${i + 1}.${item.ext}"/>`).join("")}</Relationships>`;
    images.forEach(
      (item, i) =>
        (files[`xl/media/setup-${i + 1}.${item.ext}`] = Uint8Array.from(
          atob(item.data.split(",")[1]),
          (c) => c.charCodeAt(0),
        )),
    );
  }
  return zipStore(files);
}
