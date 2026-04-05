import React, { useState } from 'react';
import { X, Download, FileText } from 'lucide-react';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportGeoJSON(events) {
  const fc = {
    type: 'FeatureCollection',
    features: events.map(ev => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
      properties: {
        id: ev.id,
        title: ev.title,
        category: ev.categoryTitle,
        status: ev.status,
        date: new Date(ev.startTime).toISOString(),
      },
    })),
  };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, `eonet-events-${new Date().toISOString().split('T')[0]}.geojson`);
}

function exportPDF(events) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('jsPDF not loaded'); return; }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const W = 210, margin = 16;
  let y = 20;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`EONET Earth Events Report`, margin, y); y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated: ${today}`, margin, y); y += 10;

  // Summary by category
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Summary by Category', margin, y); y += 6;

  const counts = {};
  events.forEach(ev => { counts[ev.categoryTitle] = (counts[ev.categoryTitle] || 0) + 1; });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([cat, cnt]) => {
    doc.text(`  ${cat}: ${cnt} event${cnt > 1 ? 's' : ''}`, margin, y); y += 5;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  y += 4;

  // Top 20 events
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Top 20 Events', margin, y); y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const top20 = [...events].sort((a, b) => b.startTime - a.startTime).slice(0, 20);
  top20.forEach((ev, i) => {
    const title = ev.title.replace(/\s+\d{6,}$/, '').slice(0, 55);
    const date  = new Date(ev.startTime).toLocaleDateString();
    const coord = `${ev.lat.toFixed(2)}, ${ev.lng.toFixed(2)}`;
    const line  = `${i + 1}. ${title} | ${ev.categoryTitle} | ${date} | ${coord} | ${ev.status}`;
    const wrapped = doc.splitTextToSize(line, W - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.5 + 1;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(130);
  doc.text('Data source: NASA EONET API v3 — https://eonet.gsfc.nasa.gov', margin, 290);

  doc.save(`eonet-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

export default function ExportModal({ events, onClose }) {
  const [done, setDone] = useState('');

  const handleGeoJSON = () => { exportGeoJSON(events); setDone('geojson'); setTimeout(onClose, 800); };
  const handlePDF     = () => { exportPDF(events);     setDone('pdf');     setTimeout(onClose, 800); };

  return (
    <div className="export-overlay" onClick={onClose}>
      <div className="export-modal glass" onClick={e => e.stopPropagation()}>
        <div className="export-header">
          <span className="export-title">Export Events</span>
          <button className="share-close" onClick={onClose}><X size={15} /></button>
        </div>
        <p className="export-subtitle">{events.length} events currently visible</p>

        <div className="export-options">
          <button className="export-btn" onClick={handleGeoJSON} disabled={done === 'geojson'}>
            <Download size={18} />
            <span>Export GeoJSON</span>
            <span className="export-hint">.geojson file</span>
          </button>
          <button className="export-btn" onClick={handlePDF} disabled={done === 'pdf'}>
            <FileText size={18} />
            <span>Export PDF Report</span>
            <span className="export-hint">Top 20 events + summary</span>
          </button>
        </div>

        {done && <div className="export-done">✓ Download started</div>}
      </div>
    </div>
  );
}
