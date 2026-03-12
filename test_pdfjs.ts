import { readFileSync } from "fs";

async function main() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buffer = readFileSync("/home/ubuntu/upload/RecibodePagamento202602.pdf");
  const uint8 = new Uint8Array(buffer);
  
  const doc = await pdfjs.getDocument({ data: uint8 }).promise;
  console.log(`Pages: ${doc.numPages}`);
  
  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n---PAGE BREAK---\n";
  }
  
  console.log(`Total text length: ${fullText.length}`);
  console.log(`First 500 chars:\n${fullText.slice(0, 500)}`);
}

main().catch(e => console.error(e));
