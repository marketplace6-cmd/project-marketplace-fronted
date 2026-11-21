import React, { useState, useEffect } from 'react';

// In-memory module cache so canvas pixel stripping runs only once across the entire app
let cachedLogoDataUrl: string | null = null;
let cachedLogoSrc: string | null = null;
let isProcessingLogo = false;
const listeners: Array<(url: string) => void> = [];

export interface TransparentBrandLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  alt?: string;
}

export function TransparentBrandLogo({
  src = '/unikart-logo.png?v=3',
  alt = 'Unikart',
  className = 'h-10 w-auto object-contain',
  style,
  ...rest
}: TransparentBrandLogoProps) {
  const [dataUrl, setDataUrl] = useState<string>(cachedLogoDataUrl || src);

  useEffect(() => {
    if (cachedLogoDataUrl && cachedLogoSrc === src) {
      setDataUrl(cachedLogoDataUrl);
      return;
    }

    const onProcessed = (url: string) => setDataUrl(url);
    listeners.push(onProcessed);

    if (!isProcessingLogo) {
      isProcessingLogo = true;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth || img.width || 400;
          const h = img.naturalHeight || img.height || 300;
          canvas.width = w;
          canvas.height = h;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const imgData = ctx.getImageData(0, 0, w, h);
            const d = imgData.data;

            // Strip near-white pixels into true alpha transparency (rgba(0,0,0,0))
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i];
              const g = d[i + 1];
              const b = d[i + 2];
              if (r > 240 && g > 240 && b > 240) {
                d[i + 3] = 0; // alpha = 0
              }
            }

            ctx.putImageData(imgData, 0, 0);
            const processedUrl = canvas.toDataURL('image/png');
            cachedLogoDataUrl = processedUrl;
            cachedLogoSrc = src;
            listeners.forEach((fn) => fn(processedUrl));
            listeners.length = 0;
          }
        } catch (e) {
          console.warn('Canvas logo transparency processing fallback:', e);
          cachedLogoDataUrl = src;
          cachedLogoSrc = src;
          listeners.forEach((fn) => fn(src));
          listeners.length = 0;
        } finally {
          isProcessingLogo = false;
        }
      };

      img.onerror = () => {
        cachedLogoDataUrl = src;
        cachedLogoSrc = src;
        listeners.forEach((fn) => fn(src));
        listeners.length = 0;
        isProcessingLogo = false;
      };
    }

    return () => {
      const idx = listeners.indexOf(onProcessed);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, [src]);

  return (
    <img
      src={dataUrl}
      alt={alt}
      className={className}
      style={{
        backgroundColor: 'transparent',
        ...style,
      }}
      loading="eager"
      {...rest}
    />
  );
}

export default TransparentBrandLogo;

