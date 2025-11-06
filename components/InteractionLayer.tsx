/**
 * InteractionLayer - Handles pan/zoom interactions for Canvas
 *
 * This invisible layer sits between Canvas (z-0) and Composer (z-50)
 * at z-5. It handles all pan/zoom interactions but stops handling
 * events when they occur in the Composer zone.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppStatus } from '../types';

interface InteractionLayerProps {
  status: AppStatus;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const COMPOSER_ZONE_HEIGHT = 200; // Bottom 200px reserved for Composer

export const InteractionLayer: React.FC<InteractionLayerProps> = ({ status }) => {
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const layerRef = useRef<HTMLDivElement>(null);

  // Get Canvas transform setter from window
  const setCanvasTransform = (window as any).__setCanvasViewTransform;

  // Only interactive during DRAWING and DONE
  const isInteractive = status !== 'THINKING' && status !== 'PREPARING';

  // Check if event is in Composer zone
  const isInComposerZone = useCallback((clientY: number): boolean => {
    const viewportHeight = window.innerHeight;
    return clientY > viewportHeight - COMPOSER_ZONE_HEIGHT;
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isInteractive || isInComposerZone(e.clientY)) return;

    setIsPanning(true);
    lastPanPoint.current = { x: e.clientX, y: e.clientY };
  }, [isInteractive, isInComposerZone]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !setCanvasTransform) return;

    const dx = e.clientX - lastPanPoint.current.x;
    const dy = e.clientY - lastPanPoint.current.y;
    lastPanPoint.current = { x: e.clientX, y: e.clientY };

    setCanvasTransform((prev: any) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, [isPanning, setCanvasTransform]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isInteractive || e.touches.length === 0) return;

    const touch = e.touches[0];
    if (isInComposerZone(touch.clientY)) return;

    setIsPanning(true);
    lastPanPoint.current = { x: touch.clientX, y: touch.clientY };
  }, [isInteractive, isInComposerZone]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPanning || e.touches.length === 0 || !setCanvasTransform) return;

    const touch = e.touches[0];
    const dx = touch.clientX - lastPanPoint.current.x;
    const dy = touch.clientY - lastPanPoint.current.y;
    lastPanPoint.current = { x: touch.clientX, y: touch.clientY };

    setCanvasTransform((prev: any) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, [isPanning, setCanvasTransform]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Wheel handler for zoom
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !setCanvasTransform) return;

    const handleWheel = (e: WheelEvent) => {
      if (!isInteractive || isInComposerZone(e.clientY)) return;

      e.preventDefault();

      const layer = layerRef.current;
      if (!layer) return;

      const rect = layer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setCanvasTransform((prev: any) => {
        const zoomFactor = 1.1;
        const newZoom = e.deltaY < 0 ? prev.zoom * zoomFactor : prev.zoom / zoomFactor;
        const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

        if (clampedZoom === prev.zoom) return prev;

        const worldX = (mouseX - prev.x) / prev.zoom;
        const worldY = (mouseY - prev.y) / prev.zoom;

        const newX = mouseX - worldX * clampedZoom;
        const newY = mouseY - worldY * clampedZoom;

        return { x: newX, y: newY, zoom: clampedZoom };
      });
    };

    layer.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      layer.removeEventListener('wheel', handleWheel);
    };
  }, [isInteractive, isInComposerZone, setCanvasTransform]);

  // Cursor style
  const cursorStyle = !isInteractive
    ? 'wait'
    : isPanning
    ? 'grabbing'
    : 'grab';

  return (
    <div
      ref={layerRef}
      className="absolute inset-0"
      style={{
        zIndex: 5,
        pointerEvents: isInteractive ? 'auto' : 'none',
        cursor: cursorStyle,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  );
};
