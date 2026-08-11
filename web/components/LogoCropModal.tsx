'use client';

import { useEffect, useRef, useState } from 'react';

const VIEWPORT = 280;
const OUTPUT = 512;

export default function LogoCropModal({ file, onCancel, onSave }: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob, dataUrl: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = natural.w && natural.h ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const dispW = natural.w * baseScale * zoom;
  const dispH = natural.h * baseScale * zoom;

  function clamp(x: number, y: number, w: number, h: number) {
    const minX = Math.min(0, VIEWPORT - w);
    const minY = Math.min(0, VIEWPORT - h);
    return { x: Math.max(minX, Math.min(0, x)), y: Math.max(minY, Math.min(0, y)) };
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    setNatural({ w, h });
    const scale = VIEWPORT / Math.min(w, h);
    setPos({ x: (VIEWPORT - w * scale) / 2, y: (VIEWPORT - h * scale) / 2 });
  }

  function onZoomChange(z: number) {
    setZoom(z);
    const scale = baseScale * z;
    setPos(p => clamp(p.x, p.y, natural.w * scale, natural.h * scale));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clamp(dragRef.current.origX + dx, dragRef.current.origY + dy, dispW, dispH));
  }
  function onPointerUp() { dragRef.current = null; }

  function save() {
    const img = imgRef.current;
    if (!img || !natural.w) return;
    const scale = baseScale * zoom;
    const sourceX = -pos.x / scale;
    const sourceY = -pos.y / scale;
    const sourceSize = VIEWPORT / scale;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onSave(blob, canvas.toDataURL('image/png'));
    }, 'image/png');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="bg-[#111] border border-[#222] rounded-2xl p-6 max-w-sm w-full">
        <h3 className="text-white font-extrabold text-base mb-1">Position your logo</h3>
        <p className="text-[#6b7280] text-xs mb-4">Drag to reposition, use the slider to zoom</p>

        <div
          className="relative mx-auto rounded-2xl overflow-hidden border-2 border-[#22c55e] touch-none select-none"
          style={{ width: VIEWPORT, height: VIEWPORT, background: '#0a0a0a', cursor: dragRef.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              style={{
                position: 'absolute',
                left: pos.x, top: pos.y,
                width: dispW || undefined, height: dispH || undefined,
                maxWidth: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-[#6b7280] text-xs flex-shrink-0">Zoom</span>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="flex-1"
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancel}
            className="flex-1 rounded-xl px-4 py-2.5 font-bold text-sm border border-[#333] text-[#9ca3af] hover:border-[#444] hover:text-white transition-all">
            Cancel
          </button>
          <button onClick={save}
            className="flex-1 rounded-xl px-4 py-2.5 font-bold text-sm bg-[#22c55e] text-black hover:bg-[#16a34a] transition-all">
            Use this logo
          </button>
        </div>
      </div>
    </div>
  );
}
