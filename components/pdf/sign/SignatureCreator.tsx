"use client";

// components/pdf/sign/SignatureCreator.tsx
//
// Draw / Type / Upload -- three ways to produce one signature image
// (transparent PNG dataUrl). Each tab is self-contained; the parent only
// cares about the final { dataUrl, aspectRatio, source } result.

import { useMemo, useRef, useState } from "react";
import { AuraSegmentedControl } from "@/components/ui/Aura";
import type { SignatureSourceKind } from "@/lib/sign/types";

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 140;

type Stroke = { points: { x: number; y: number }[]; width: number };

const HANDWRITING_FONTS = [
  { value: "brush", label: "Brush", stack: `"Brush Script MT", "Segoe Script", cursive` },
  { value: "elegant", label: "Elegant", stack: `"Lucida Handwriting", "Bradley Hand", cursive` },
  { value: "casual", label: "Casual", stack: `"Comic Sans MS", "Segoe Print", cursive` },
] as const;

export type CreatedSignature = { dataUrl: string; aspectRatio: number; source: SignatureSourceKind };

async function canvasToSignature(canvas: HTMLCanvasElement, source: SignatureSourceKind): Promise<CreatedSignature | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return {
    dataUrl: URL.createObjectURL(blob),
    aspectRatio: canvas.width / canvas.height,
    source,
  };
}

function DrawTab({ onCreate }: { onCreate: (signature: CreatedSignature) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [penWidth, setPenWidth] = useState(3);
  const [hasInk, setHasInk] = useState(false);

  function redraw() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      context.strokeStyle = "#12141a";
      context.lineWidth = stroke.width;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    }
    setHasInk(strokesRef.current.length > 0);
  }

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.setPointerCapture(event.pointerId);
    currentStrokeRef.current = { points: [getPoint(event)], width: penWidth };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    stroke.points.push(getPoint(event));
    const context = canvasRef.current?.getContext("2d");
    if (!context || stroke.points.length < 2) return;
    const [a, b] = stroke.points.slice(-2);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.strokeStyle = "#12141a";
    context.lineWidth = stroke.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  function handlePointerUp() {
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      setHasInk(true);
    }
    currentStrokeRef.current = null;
  }

  function undo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
  }

  function clear() {
    strokesRef.current = [];
    redraw();
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full touch-none rounded-lg border border-[var(--text-primary)]/14 bg-white"
        style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
      />
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]/50">
        Pen thickness
        <input
          type="range"
          min={1}
          max={8}
          value={penWidth}
          onChange={(event) => setPenWidth(Number(event.target.value))}
          className="flex-1"
        />
      </label>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={undo} disabled={!hasInk} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--text-primary)]/24 disabled:opacity-35">
          Undo stroke
        </button>
        <button type="button" onClick={clear} disabled={!hasInk} className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--text-primary)]/24 disabled:opacity-35">
          Clear
        </button>
        <button
          type="button"
          disabled={!hasInk}
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            void canvasToSignature(canvas, "draw").then((result) => result && onCreate(result));
          }}
          className="ml-auto rounded-full bg-[var(--lumeo-gold)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--lumeo-seal-500)] disabled:opacity-40"
        >
          Use this signature
        </button>
      </div>
    </div>
  );
}

function TypeTab({ onCreate }: { onCreate: (signature: CreatedSignature) => void }) {
  const [text, setText] = useState("");
  const [font, setFont] = useState<(typeof HANDWRITING_FONTS)[number]["value"]>("brush");
  const [fontSize, setFontSize] = useState(52);
  const fontStack = HANDWRITING_FONTS.find((item) => item.value === font)?.stack ?? "cursive";

  async function use() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#12141a";
    context.textBaseline = "middle";
    let size = fontSize;
    context.font = `italic ${size}px ${fontStack}`;
    while (context.measureText(trimmed).width > canvas.width - 20 && size > 16) {
      size -= 2;
      context.font = `italic ${size}px ${fontStack}`;
    }
    context.fillText(trimmed, 10, canvas.height / 2 + 4);
    const result = await canvasToSignature(canvas, "type");
    if (result) onCreate(result);
  }

  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type your name"
        className="h-11 w-full rounded-lg border border-[var(--text-primary)]/14 bg-[var(--text-primary)]/[0.035] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--lumeo-gold)]/45"
      />

      <div
        className="mt-3 flex items-center justify-center rounded-lg border border-[var(--text-primary)]/14 bg-white"
        style={{ height: CANVAS_HEIGHT }}
      >
        <span style={{ fontFamily: fontStack, fontStyle: "italic", fontSize: `${Math.min(fontSize, 40)}px`, color: "#12141a" }}>
          {text.trim() || "Your signature"}
        </span>
      </div>

      <div className="mt-3">
        <AuraSegmentedControl
          label="Style"
          options={HANDWRITING_FONTS.map((item) => ({ value: item.value, label: item.label }))}
          value={font}
          onChange={(value) => setFont(value as typeof font)}
        />
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]/50">
        Size
        <input type="range" min={28} max={72} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} className="flex-1" />
      </label>

      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => void use()}
        className="mt-2 w-full rounded-full bg-[var(--lumeo-gold)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--lumeo-seal-500)] disabled:opacity-40"
      >
        Use this signature
      </button>
    </div>
  );
}

function UploadTab({ onCreate }: { onCreate: (signature: CreatedSignature) => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  function handleFile(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      setImageUrl(url);
      setCrop(null);
    };
    img.src = url;
  }

  function handleContainerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setCrop({ x: dragStartRef.current.x, y: dragStartRef.current.y, width: 0, height: 0 });
  }

  function handleContainerPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!start || !rect) return;
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    setCrop({
      x: Math.min(start.x, currentX),
      y: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    });
  }

  function handleContainerPointerUp() {
    dragStartRef.current = null;
  }

  const canUse = Boolean(imageUrl);

  async function use() {
    const img = imgElRef.current;
    const container = containerRef.current;
    if (!img || !container || !imageSize) return;
    const containerRect = container.getBoundingClientRect();
    const scaleX = imageSize.width / containerRect.width;
    const scaleY = imageSize.height / containerRect.height;

    const region =
      crop && crop.width > 8 && crop.height > 8
        ? { x: crop.x * scaleX, y: crop.y * scaleY, width: crop.width * scaleX, height: crop.height * scaleY }
        : { x: 0, y: 0, width: imageSize.width, height: imageSize.height };

    const canvas = document.createElement("canvas");
    canvas.width = region.width;
    canvas.height = region.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    const result = await canvasToSignature(canvas, "upload");
    if (result) onCreate(result);
  }

  return (
    <div>
      {!imageUrl ? (
        <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--text-primary)]/20 text-sm text-[var(--text-primary)]/50 transition hover:border-[var(--lumeo-gold)]/40 hover:text-[var(--text-primary)]/70">
          <span>Upload a signature image</span>
          <span className="text-xs text-[var(--text-primary)]/34">PNG, JPG, or WEBP</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleFile(file);
              event.target.value = "";
            }}
          />
        </label>
      ) : (
        <div>
          <div
            ref={containerRef}
            onPointerDown={handleContainerPointerDown}
            onPointerMove={handleContainerPointerMove}
            onPointerUp={handleContainerPointerUp}
            className="relative touch-none overflow-hidden rounded-lg border border-[var(--text-primary)]/14 bg-[repeating-conic-gradient(#e5e5e5_0_25%,white_0_50%)_0_0/16px_16px]"
            style={{ height: CANVAS_HEIGHT + 20 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgElRef} src={imageUrl} alt="Uploaded signature" className="h-full w-full select-none object-contain" draggable={false} />
            {crop && crop.width > 2 ? (
              <div
                className="pointer-events-none absolute border-2 border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/10"
                style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
              />
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-primary)]/40">Drag a box to crop, or leave it to use the full image.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setImageUrl("");
                setCrop(null);
              }}
              className="rounded-full border border-[var(--text-primary)]/12 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--text-primary)]/24"
            >
              Choose another
            </button>
            <button
              type="button"
              disabled={!canUse}
              onClick={() => void use()}
              className="ml-auto rounded-full bg-[var(--lumeo-gold)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--lumeo-seal-500)] disabled:opacity-40"
            >
              Use this signature
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SignatureCreator({ onCreate }: { onCreate: (signature: CreatedSignature) => void }) {
  const [tab, setTab] = useState<SignatureSourceKind>("draw");
  const tabs = useMemo(
    () => [
      { value: "draw" as const, label: "Draw" },
      { value: "type" as const, label: "Type" },
      { value: "upload" as const, label: "Upload" },
    ],
    [],
  );

  return (
    <div>
      <AuraSegmentedControl label="Signature type" options={tabs} value={tab} onChange={(value) => setTab(value as SignatureSourceKind)} />
      <div className="mt-3">
        {tab === "draw" ? <DrawTab onCreate={onCreate} /> : null}
        {tab === "type" ? <TypeTab onCreate={onCreate} /> : null}
        {tab === "upload" ? <UploadTab onCreate={onCreate} /> : null}
      </div>
    </div>
  );
}
