
'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PDFData {
  title: string;
  id: string;
  date: string;
  clientName: string;
  clientPhone?: string;
  boutiqueName: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  totalAmount: number;
  paymentType?: string;
  notes?: string;
}

/** Entier groupé par milliers avec espaces ASCII (compatible Helvetica / jsPDF). */
function formatIntegerSpaces(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(Math.abs(n));
  const s = rounded.toString();
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n < 0 ? `-${grouped}` : grouped;
}

/** Montant facture en franc guinéen, ex. "600 000 FG" (évite toLocaleString fr-FR → slash en PDF). */
export function formatAmountFG(n: number): string {
  return `${formatIntegerSpaces(n)} FG`;
}

export const generatePDF = (data: PDFData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(22);
  doc.setTextColor(41, 128, 185); // Primary color
  doc.text('HOOLO SERVICE', 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(data.boutiqueName, 14, 28);
  doc.text('Guinée - Conakry', 14, 33);
  doc.text('Tel: +224 620 00 00 00', 14, 38);

  // Document Info
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text(data.title.toUpperCase(), pageWidth - 14, 20, { align: 'right' });
  
  doc.setFontSize(10);
  doc.text(`N°: ${data.id}`, pageWidth - 14, 28, { align: 'right' });
  doc.text(`Date: ${data.date}`, pageWidth - 14, 33, { align: 'right' });

  // Client Section
  doc.setDrawColor(200);
  doc.line(14, 45, pageWidth - 14, 45);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DESTINATAIRE:', 14, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(data.clientName, 14, 62);
  if (data.clientPhone) doc.text(`Tél: ${data.clientPhone}`, 14, 67);

  // Table
  const tableData = data.items.map((item) => [
    item.description,
    item.quantity.toString(),
    formatAmountFG(item.unitPrice),
    formatAmountFG(item.total),
  ]);

  autoTable(doc, {
    startY: 75,
    head: [['Désignation', 'Qté', 'Prix Unitaire', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    margin: { top: 75 },
  });

  // Summary - position explicite (évite la troncature ; montant en espaces ASCII + FG)
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const margin = 14;
  const summaryMaxWidth = pageWidth - 2 * margin;

  const totalText = `TOTAL : ${formatAmountFG(data.totalAmount)}`;

  doc.setFont('helvetica', 'bold');
  let fontSize = 12;
  doc.setFontSize(fontSize);
  let tw = doc.getTextWidth(totalText);
  while (tw > summaryMaxWidth && fontSize > 8) {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
    tw = doc.getTextWidth(totalText);
  }
  if (tw > summaryMaxWidth) {
    const lines = doc.splitTextToSize(totalText, summaryMaxWidth);
    const lh = fontSize * 1.2;
    lines.forEach((line, i) => {
      const lw = doc.getTextWidth(line);
      doc.text(line, pageWidth - margin - lw, finalY + i * lh);
    });
  } else {
    doc.text(totalText, pageWidth - margin - tw, finalY);
  }

  if (data.paymentType) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mode de règlement: ${data.paymentType}`, margin, finalY);
  }

  // Notes
  if (data.notes) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('Notes:', 14, finalY + 15);
    const splitNotes = doc.splitTextToSize(data.notes, pageWidth - 28);
    doc.text(splitNotes, 14, finalY + 20);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Merci de votre confiance ! Les marchandises vendues ne sont ni reprises ni échangées.', pageWidth / 2, 285, { align: 'center' });

  doc.save(`${data.title}_${data.id}.pdf`);
};

export const shareOnWhatsApp = (data: PDFData) => {
  const message = `*HOOLO SERVICE - ${data.title}*\n` +
    `--------------------------\n` +
    `Client: ${data.clientName}\n` +
    `Date: ${data.date}\n` +
    `Montant: ${formatAmountFG(data.totalAmount)}\n` +
    `--------------------------\n` +
    `Merci de votre confiance !`;
  
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${data.clientPhone?.replace(/\s+/g, '')}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
};
