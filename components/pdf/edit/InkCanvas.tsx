"use client";

// components/pdf/edit/InkCanvas.tsx
//
// Freehand ink capture, active only while the Draw tool is selected. Renders
// a transparent canvas exactly matching the page stage's pixel dimensions,
// captures one stroke per pointer-down-to-up gesture, then crops the
// drawn region to its own small canvas and rasterizes that crop to a PNG
// data URL -- avoiding storing a full-page-sized image per stroke.
//
// Adapted from SignatureCreator.tsx's DrawTab (same stroke-capture and
// redraw-loop mechanism), but draws directly on the real page stage instead
// of an isolated fixed-size modal canvas.

import { useRef } from "react";

type Point = { x: number; y: number };

export function InkCanvas({
  stageWidthPx,
  stageHeightPx,
  color,
  strokeWidthPx,
  onStrokeComplete,
}: {
  stageWidthPx: number;
  stageHeightPx: number;
  color: string;
  strokeWidthPx: number;
  onStrokeComplete: (result: { pngDataUrl: string; xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function redraw() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const points = pointsRef.current;
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.strokeStyle = color;
    context.lineWidth = strokeWidthPx;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drawingRef.current = true;
    pointsRef.current = [getPoint(event)];
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    pointsRef.current.push(getPoint(event));
    redraw();
  }

  function finishStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);

    const points = pointsRef.current;
    const canvas = canvasRef.current;
    if (points.length < 2 || !canvas) {
      pointsRef.current = [];
      redraw();
      return;
    }

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    const padding = strokeWidthPx;
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(canvas.width, maxX + padding) - cropX;
    const cropHeight = Math.min(canvas.height, maxY + padding) - cropY;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(cropWidth));
    cropCanvas.height = Math.max(1, Math.round(cropHeight));
    const cropContext = cropCanvas.getContext("2d");
    if (cropContext) {
      cropContext.beginPath();
      cropContext.moveTo(points[0].x - cropX, points[0].y - cropY);
      for (const point of points.slice(1)) cropContext.lineTo(point.x - cropX, point.y - cropY);
      cropContext.strokeStyle = color;
      cropContext.lineWidth = strokeWidthPx;
      cropContext.lineCap = "round";
      cropContext.lineJoin = "round";
      cropContext.stroke();
    }

    onStrokeComplete({
      pngDataUrl: cropCanvas.toDataURL("image/png"),
      xPct: (cropX / canvas.width) * 100,
      yPct: (cropY / canvas.height) * 100,
      widthPct: (cropWidth / canvas.width) * 100,
      heightPct: (cropHeight / canvas.height) * 100,
    });

    pointsRef.current = [];
    redraw();
  }

  return (
    <canvas
      ref={canvasRef}
      width={stageWidthPx}
      height={stageHeightPx}
      role="img"
      aria-label="Ink drawing surface -- draw freehand with mouse, stylus, or touch"
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}
